package com.homeflix.identity.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.homeflix.identity.error.ApiException;
import com.homeflix.identity.profile.LibraryPurgeClient;
import com.homeflix.identity.security.JwtService;

/** Suppression d'un compte (le sien ou par un administrateur) : données locales, purge Library, panne de Library. */
@SpringBootTest(properties = {
        "homeflix.jwt.generate-if-missing=true",
        "homeflix.setup.init-on-startup=false" })
@AutoConfigureMockMvc
@Testcontainers
class AccountDeletionIntegrationTests {

    private static final String PASSWORD = String.join("-", "mot", "de", "passe", "de", "test");

    static class FakeLibrary implements LibraryPurgeClient {
        final List<UUID> purgedAccounts = new ArrayList<>();
        volatile boolean down;

        @Override
        public void purgeProfile(UUID profileId) {
        }

        @Override
        public void purgeAccount(UUID accountId) {
            if (down) {
                throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "LIBRARY_UNAVAILABLE", "Library indisponible", "KO");
            }
            purgedAccounts.add(accountId);
        }
    }

    @TestConfiguration
    static class LibraryOverride {
        @Bean @Primary FakeLibrary fakeLibrary() { return new FakeLibrary(); }
    }

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired AccountRepository accounts;
    @Autowired ProfileRepository profiles;
    @Autowired RoleRepository roles;
    @Autowired PasswordEncoder encoder;
    @Autowired JwtService jwt;
    @Autowired FakeLibrary library;

    Account admin;
    Account other;
    Account alice;

    @BeforeEach
    void reset() {
        jdbc.update("DELETE FROM accounts");
        library.purgedAccounts.clear();
        library.down = false;
        admin = accounts.save(new Account("admin", "admin@maison.fr", encoder.encode(PASSWORD), roles.getReferenceById(Role.ADMIN)));
        other = accounts.save(new Account("autre", "autre@maison.fr", encoder.encode(PASSWORD), roles.getReferenceById(Role.ADMIN)));
        alice = accounts.save(new Account("alice", "alice@maison.fr", encoder.encode(PASSWORD), roles.getReferenceById(Role.USER)));
        profiles.save(new Profile(alice, "Alice", "bleu"));
        profiles.save(new Profile(alice, "Bob", "rouge"));
        jdbc.update("""
            insert into refresh_tokens (id, account_id, family_id, token_hash, expires_at)
            values (?, ?, ?, 'h', now() + interval '1 day')""", UUID.randomUUID(), alice.getId(), UUID.randomUUID());
    }

    private String bearer(Account a) {
        return "Bearer " + jwt.issueAccessToken(a.getId(), List.of(a.getRole().getName()), null);
    }

    private static String body(String password) {
        return "{\"password\":\"" + password + "\"}";
    }

    private int count(String table, UUID accountId) {
        return jdbc.queryForObject("select count(*) from " + table + " where account_id = ?", Integer.class, accountId);
    }

    @Test
    void anAccountDeletesItselfWithItsPasswordAndEverythingGoes() throws Exception {
        mvc.perform(delete("/api/v1/accounts/me").header("Authorization", bearer(alice))
                .contentType(MediaType.APPLICATION_JSON).content(body(PASSWORD)))
            .andExpect(status().isNoContent())
            .andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.containsString("Max-Age=0")));
        assertThat(accounts.findById(alice.getId())).isEmpty();
        assertThat(count("profiles", alice.getId())).isZero();
        assertThat(count("refresh_tokens", alice.getId())).isZero();
        assertThat(library.purgedAccounts).containsExactly(alice.getId());
        assertThat(accounts.count()).isEqualTo(2);   // les autres comptes sont intacts
    }

    @Test
    void aWrongPasswordIs401AndNothingIsDeleted() throws Exception {
        mvc.perform(delete("/api/v1/accounts/me").header("Authorization", bearer(alice))
                .contentType(MediaType.APPLICATION_JSON).content(body("mauvais-mot-de-passe")))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.code").value("AUTH_INVALID_CREDENTIALS"));
        assertThat(accounts.findById(alice.getId())).isPresent();
        assertThat(library.purgedAccounts).isEmpty();
    }

    @Test
    void aMissingOrBlankPasswordIs400() throws Exception {
        for (String json : new String[] { "{}", "{\"password\":\"\"}", "{\"password\":\"   \"}" }) {
            mvc.perform(delete("/api/v1/accounts/me").header("Authorization", bearer(alice))
                    .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isBadRequest());
        }
        assertThat(accounts.findById(alice.getId())).isPresent();
    }

    @Test
    void anonymousGets401() throws Exception {
        mvc.perform(delete("/api/v1/accounts/me").contentType(MediaType.APPLICATION_JSON).content(body(PASSWORD)))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void whenLibraryIsDownNothingIsDeletedAndTheCallCanBeRetried() throws Exception {
        library.down = true;
        mvc.perform(delete("/api/v1/accounts/me").header("Authorization", bearer(alice))
                .contentType(MediaType.APPLICATION_JSON).content(body(PASSWORD)))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.code").value("LIBRARY_UNAVAILABLE"));
        assertThat(accounts.findById(alice.getId())).isPresent();
        assertThat(count("profiles", alice.getId())).isEqualTo(2);
        assertThat(count("refresh_tokens", alice.getId())).isEqualTo(1);

        library.down = false;
        mvc.perform(delete("/api/v1/accounts/me").header("Authorization", bearer(alice))
                .contentType(MediaType.APPLICATION_JSON).content(body(PASSWORD)))
            .andExpect(status().isNoContent());
        assertThat(accounts.findById(alice.getId())).isEmpty();
    }

    @Test
    void theLastAdministratorCannotDeleteItself() throws Exception {
        accounts.delete(other);
        mvc.perform(delete("/api/v1/accounts/me").header("Authorization", bearer(admin))
                .contentType(MediaType.APPLICATION_JSON).content(body(PASSWORD)))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("LAST_ADMIN"));
        assertThat(accounts.findById(admin.getId())).isPresent();
        assertThat(library.purgedAccounts).isEmpty();
    }

    @Test
    void anAdministratorCanDeleteItselfWhenAnotherOneRemains() throws Exception {
        mvc.perform(delete("/api/v1/accounts/me").header("Authorization", bearer(admin))
                .contentType(MediaType.APPLICATION_JSON).content(body(PASSWORD)))
            .andExpect(status().isNoContent());
        assertThat(accounts.findById(admin.getId())).isEmpty();
    }

    @Test
    void anAdminDeletesAnotherAccountAndItsData() throws Exception {
        mvc.perform(delete("/api/v1/admin/accounts/" + alice.getId()).header("Authorization", bearer(admin)))
            .andExpect(status().isNoContent());
        assertThat(accounts.findById(alice.getId())).isEmpty();
        assertThat(count("profiles", alice.getId())).isZero();
        assertThat(count("refresh_tokens", alice.getId())).isZero();
        assertThat(library.purgedAccounts).containsExactly(alice.getId());
    }

    @Test
    void anAdminCannotDeleteTheLastAdministrator() throws Exception {
        accounts.delete(other);
        mvc.perform(delete("/api/v1/admin/accounts/" + admin.getId()).header("Authorization", bearer(admin)))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("LAST_ADMIN"));
        assertThat(accounts.findById(admin.getId())).isPresent();
    }

    @Test
    void aDisabledAdministratorIsDeletableAndDoesNotCountAsTheLastOne() throws Exception {
        jdbc.update("update accounts set enabled = false where id = ?", other.getId());
        mvc.perform(delete("/api/v1/admin/accounts/" + other.getId()).header("Authorization", bearer(admin)))
            .andExpect(status().isNoContent());
        assertThat(accounts.findById(admin.getId())).isPresent();
    }

    @Test
    void deletingAnUnknownAccountIs404() throws Exception {
        mvc.perform(delete("/api/v1/admin/accounts/" + UUID.randomUUID()).header("Authorization", bearer(admin)))
            .andExpect(status().isNotFound());
    }

    @Test
    void aUserCannotUseTheAdminRoute() throws Exception {
        mvc.perform(delete("/api/v1/admin/accounts/" + admin.getId()).header("Authorization", bearer(alice)))
            .andExpect(status().isForbidden());
        assertThat(accounts.findById(admin.getId())).isPresent();
    }

    @Test
    void whenLibraryIsDownTheAdminDeletionIs503AndKeepsTheAccount() throws Exception {
        library.down = true;
        mvc.perform(delete("/api/v1/admin/accounts/" + alice.getId()).header("Authorization", bearer(admin)))
            .andExpect(status().isServiceUnavailable());
        assertThat(accounts.findById(alice.getId())).isPresent();
    }
}
