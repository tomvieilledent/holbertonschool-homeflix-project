package com.homeflix.identity.profile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
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

import com.homeflix.identity.account.Account;
import com.homeflix.identity.account.AccountRepository;
import com.homeflix.identity.account.Profile;
import com.homeflix.identity.account.ProfileRepository;
import com.homeflix.identity.account.RefreshToken;
import com.homeflix.identity.account.RefreshTokenRepository;
import com.homeflix.identity.account.Role;
import com.homeflix.identity.account.RoleRepository;
import com.homeflix.identity.error.ApiException;
import com.homeflix.identity.security.JwtService;
import com.nimbusds.jwt.SignedJWT;

@SpringBootTest(properties = {
        "homeflix.jwt.generate-if-missing=true",
        "homeflix.setup.init-on-startup=false" })
@AutoConfigureMockMvc
@Testcontainers
class ProfileIntegrationTests {

    /** Library simulée : enregistre les purges, ou simule une panne. */
    static class FakeLibrary implements LibraryPurgeClient {
        final List<UUID> purged = new ArrayList<>();
        final List<UUID> purgedAccounts = new ArrayList<>();
        volatile boolean down;

        @Override
        public void purgeProfile(UUID profileId) {
            if (down) {
                throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "LIBRARY_UNAVAILABLE", "Library indisponible", "KO");
            }
            purged.add(profileId);
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
        @Bean @Primary com.homeflix.identity.account.AcquisitionPurgeClient fakeAcquisition() { return accountId -> { }; }
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
    @Autowired RefreshTokenRepository refreshTokens;
    @Autowired RoleRepository roles;
    @Autowired PasswordEncoder encoder;
    @Autowired JwtService jwt;
    @Autowired FakeLibrary library;

    Account alice;
    Account bob;

    @BeforeEach
    void reset() {
        jdbc.update("DELETE FROM accounts");
        library.purged.clear();
        library.down = false;
        alice = accounts.save(new Account("alice", "alice@maison.fr", encoder.encode("x"), roles.getReferenceById(Role.USER)));
        bob = accounts.save(new Account("bob", "bob@maison.fr", encoder.encode("x"), roles.getReferenceById(Role.USER)));
    }

    private String bearer(Account a) {
        return "Bearer " + jwt.issueAccessToken(a.getId(), List.of(a.getRole().getName()), null);
    }

    /** Jeton rattaché à une session de refresh ouverte, comme après une connexion. */
    private String bearerWithSession(Account a, Instant expiresAt, boolean revoked) {
        UUID family = UUID.randomUUID();
        RefreshToken session = new RefreshToken(a, family, UUID.randomUUID().toString(), expiresAt);
        if (revoked) {
            session.revoke(Instant.now());
        }
        refreshTokens.save(session);
        return "Bearer " + jwt.issueAccessToken(a.getId(), List.of(a.getRole().getName()), null, family);
    }

    private String bearerWithSession(Account a) {
        return bearerWithSession(a, Instant.now().plusSeconds(3600), false);
    }

    private static String json(String name, String avatar) {
        return "{\"name\":\"" + name + "\",\"avatar\":\"" + avatar + "\"}";
    }

    private Profile profile(Account a, String name) {
        return profiles.save(new Profile(a, name, "bleu"));
    }

    @Test
    void requiresAuthentication() throws Exception {
        mvc.perform(get("/api/v1/profiles")).andExpect(status().isUnauthorized());
    }

    @Test
    void createsAndListsTwoProfiles() throws Exception {
        mvc.perform(post("/api/v1/profiles").header("Authorization", bearer(alice))
                .contentType(MediaType.APPLICATION_JSON).content(json("Léa", "bleu")))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.name").value("Léa"));
        mvc.perform(post("/api/v1/profiles").header("Authorization", bearer(alice))
                .contentType(MediaType.APPLICATION_JSON).content(json("Tom", "🦊")))
            .andExpect(status().isCreated());
        mvc.perform(get("/api/v1/profiles").header("Authorization", bearer(alice)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2));
        mvc.perform(get("/api/v1/profiles").header("Authorization", bearer(bob)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void limitsToFiveProfilesPerAccount() throws Exception {
        for (int i = 1; i <= 5; i++) {
            profile(alice, "p" + i);
        }
        mvc.perform(post("/api/v1/profiles").header("Authorization", bearer(alice))
                .contentType(MediaType.APPLICATION_JSON).content(json("p6", "bleu")))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PROFILE_LIMIT_REACHED"));
        // Un autre compte n'est pas concerné par la limite.
        mvc.perform(post("/api/v1/profiles").header("Authorization", bearer(bob))
                .contentType(MediaType.APPLICATION_JSON).content(json("p6", "bleu")))
            .andExpect(status().isCreated());
    }

    @Test
    void rejectsDuplicateNameInAccountOnly() throws Exception {
        profile(alice, "Léa");
        mvc.perform(post("/api/v1/profiles").header("Authorization", bearer(alice))
                .contentType(MediaType.APPLICATION_JSON).content(json("Léa", "rouge")))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CONFLICT"));
        mvc.perform(post("/api/v1/profiles").header("Authorization", bearer(bob))
                .contentType(MediaType.APPLICATION_JSON).content(json("Léa", "rouge")))
            .andExpect(status().isCreated());
    }

    @Test
    void validatesInput() throws Exception {
        mvc.perform(post("/api/v1/profiles").header("Authorization", bearer(alice))
                .contentType(MediaType.APPLICATION_JSON).content(json("   ", "bleu")))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        mvc.perform(post("/api/v1/profiles").header("Authorization", bearer(alice))
                .contentType(MediaType.APPLICATION_JSON).content(json("x".repeat(31), "bleu")))
            .andExpect(status().isBadRequest());
    }

    @Test
    void renamesOwnProfileAndKeepsUniqueness() throws Exception {
        Profile lea = profile(alice, "Léa");
        profile(alice, "Tom");
        mvc.perform(patch("/api/v1/profiles/" + lea.getId()).header("Authorization", bearer(alice))
                .contentType(MediaType.APPLICATION_JSON).content("{\"avatar\":\"vert\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Léa"))
            .andExpect(jsonPath("$.avatar").value("vert"));
        mvc.perform(patch("/api/v1/profiles/" + lea.getId()).header("Authorization", bearer(alice))
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Tom\"}"))
            .andExpect(status().isConflict());
    }

    @Test
    void otherAccountsProfileIs404ForEveryOperation() throws Exception {
        Profile bobs = profile(bob, "Bob");
        String id = bobs.getId().toString();
        mvc.perform(post("/api/v1/profiles/" + id + "/select").header("Authorization", bearer(alice)))
            .andExpect(status().isNotFound());
        mvc.perform(patch("/api/v1/profiles/" + id).header("Authorization", bearer(alice))
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Pirate\"}"))
            .andExpect(status().isNotFound());
        mvc.perform(delete("/api/v1/profiles/" + id).header("Authorization", bearer(alice)))
            .andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/profiles/" + UUID.randomUUID() + "/select").header("Authorization", bearer(alice)))
            .andExpect(status().isNotFound());
        assertThat(profiles.findById(bobs.getId())).get().extracting(Profile::getName).isEqualTo("Bob");
        assertThat(library.purged).isEmpty();
    }

    @Test
    void selectReturnsTokenWithSubAndPid() throws Exception {
        Profile lea = profile(alice, "Léa");
        String body = mvc.perform(post("/api/v1/profiles/" + lea.getId() + "/select")
                .header("Authorization", bearerWithSession(alice)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.tokenType").value("Bearer"))
            .andReturn().getResponse().getContentAsString();
        String token = body.replaceAll(".*\"accessToken\":\"([^\"]+)\".*", "$1");
        var claims = SignedJWT.parse(token).getJWTClaimsSet();
        assertThat(claims.getSubject()).isEqualTo(alice.getId().toString());
        assertThat(claims.getStringClaim("pid")).isEqualTo(lea.getId().toString());
        assertThat(claims.getStringListClaim("roles")).containsExactly("USER");
    }

    @Test
    void selectIsRefusedToADisabledAccount() throws Exception {
        Profile lea = profile(alice, "Léa");
        String token = bearerWithSession(alice);
        jdbc.update("UPDATE accounts SET enabled = false WHERE id = ?", alice.getId());
        mvc.perform(post("/api/v1/profiles/" + lea.getId() + "/select").header("Authorization", token))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ACCOUNT_DISABLED"));
    }

    @Test
    void selectIsRefusedWithoutAnOpenSession() throws Exception {
        Profile lea = profile(alice, "Léa");
        List<String> tokens = List.of(
            bearer(alice),
            bearerWithSession(alice, Instant.now().plusSeconds(3600), true),
            bearerWithSession(alice, Instant.now().minusSeconds(1), false));
        for (String token : tokens) {
            mvc.perform(post("/api/v1/profiles/" + lea.getId() + "/select").header("Authorization", token))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("SESSION_EXPIRED"));
        }
    }

    @Test
    void deletePurgesLibraryThenRemovesProfile() throws Exception {
        Profile lea = profile(alice, "Léa");
        profile(alice, "Tom");
        mvc.perform(delete("/api/v1/profiles/" + lea.getId()).header("Authorization", bearer(alice)))
            .andExpect(status().isNoContent());
        assertThat(library.purged).containsExactly(lea.getId());
        assertThat(profiles.findById(lea.getId())).isEmpty();
    }

    @Test
    void deleteKeepsProfileWhenLibraryIsDown() throws Exception {
        Profile lea = profile(alice, "Léa");
        profile(alice, "Tom");
        library.down = true;
        mvc.perform(delete("/api/v1/profiles/" + lea.getId()).header("Authorization", bearer(alice)))
            .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("LIBRARY_UNAVAILABLE"));
        assertThat(profiles.findById(lea.getId())).isPresent();
    }

    @Test
    void lastProfileCannotBeDeleted() throws Exception {
        Profile lea = profile(alice, "Léa");
        mvc.perform(delete("/api/v1/profiles/" + lea.getId()).header("Authorization", bearer(alice)))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CONFLICT"));
        assertThat(profiles.findById(lea.getId())).isPresent();
        assertThat(library.purged).isEmpty();
    }
}
