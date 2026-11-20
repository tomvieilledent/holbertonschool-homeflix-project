package com.homeflix.identity.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.homeflix.identity.account.Account;
import com.homeflix.identity.account.AccountRepository;
import com.homeflix.identity.account.Profile;
import com.homeflix.identity.account.ProfileRepository;
import com.homeflix.identity.account.Role;
import com.homeflix.identity.account.RoleRepository;
import com.homeflix.identity.security.JwtService;

/**
 * `GET /auth/me` : le compte vient de la base (jamais du jeton), le profil actif du claim `pid` seulement s'il
 * appartient encore au compte. Sur PostgreSQL réel.
 */
@SpringBootTest(properties = {
        "homeflix.jwt.generate-if-missing=true",
        "homeflix.setup.init-on-startup=false",
        "homeflix.auth.cookie-secure=true" })
@AutoConfigureMockMvc
@Testcontainers
class MeIntegrationTests {

    // Mot de passe de test assemblé au runtime : aucun secret littéral dans le dépôt.
    private static final String PASSWORD = String.join("-", "mot", "de", "passe", "de", "test");

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

    private Account alice;

    @BeforeEach
    void reset() {
        jdbc.update("DELETE FROM accounts");
        alice = accounts.save(new Account("alice", "alice@maison.fr", encoder.encode(PASSWORD),
            roles.getReferenceById(Role.USER)));
    }

    private String tokenFor(Account account, UUID profileId) {
        return jwt.issueAccessToken(account.getId(), List.of(account.getRole().getName()), profileId);
    }

    private MvcResult me(String token) throws Exception {
        var request = get("/api/v1/auth/me");
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        return mvc.perform(request).andReturn();
    }

    @Test
    void returnsTheAccountOfTheLoggedInSessionWithoutAnyHash() throws Exception {
        String login = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"alice\",\"password\":\"" + PASSWORD + "\"}"))
            .andReturn().getResponse().getContentAsString();
        String access = login.replaceAll(".*\"accessToken\":\"([^\"]+)\".*", "$1");

        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + access))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.account.id").value(alice.getId().toString()))
            .andExpect(jsonPath("$.account.username").value("alice"))
            .andExpect(jsonPath("$.account.email").value("alice@maison.fr"))
            .andExpect(jsonPath("$.account.role").value("USER"))
            .andExpect(jsonPath("$.account.enabled").value(true))
            .andExpect(jsonPath("$.account.createdAt").exists())
            .andExpect(jsonPath("$.activeProfileId").doesNotExist())
            .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("passwordHash"))))
            .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("$argon2"))));
    }

    @Test
    void returnsTheActiveProfileOfTheToken() throws Exception {
        Profile profile = profiles.save(new Profile(alice, "Alice", "avatar-1"));

        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + tokenFor(alice, profile.getId())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.activeProfileId").value(profile.getId().toString()));
    }

    @Test
    void ignoresAProfileThatDoesNotBelongToTheAccount() throws Exception {
        Account bob = accounts.save(new Account("bob", "bob@maison.fr", encoder.encode(PASSWORD),
            roles.getReferenceById(Role.USER)));
        Profile bobsProfile = profiles.save(new Profile(bob, "Bob", "avatar-1"));

        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + tokenFor(alice, bobsProfile.getId())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.account.username").value("alice"))
            .andExpect(jsonPath("$.activeProfileId").doesNotExist());
    }

    @Test
    void ignoresAProfileThatNoLongerExists() throws Exception {
        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + tokenFor(alice, UUID.randomUUID())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.activeProfileId").doesNotExist());
    }

    @Test
    void withoutATokenGets401ProblemJson() throws Exception {
        MvcResult result = me(null);

        assertThat(result.getResponse().getStatus()).isEqualTo(401);
        assertThat(result.getResponse().getContentType()).startsWith("application/problem+json");
        assertThat(result.getResponse().getContentAsString()).contains("SESSION_EXPIRED");
    }

    @Test
    void aTokenForADeletedAccountGets401() throws Exception {
        String token = tokenFor(alice, null);
        jdbc.update("DELETE FROM accounts");

        MvcResult result = me(token);

        assertThat(result.getResponse().getStatus()).isEqualTo(401);
        assertThat(result.getResponse().getContentAsString()).contains("SESSION_EXPIRED");
    }

    @Test
    void aTokenForADisabledAccountGets403() throws Exception {
        String token = tokenFor(alice, null);
        alice.setEnabled(false);
        accounts.save(alice);

        MvcResult result = me(token);

        assertThat(result.getResponse().getStatus()).isEqualTo(403);
        assertThat(result.getResponse().getContentAsString()).contains("ACCOUNT_DISABLED");
    }

    @Test
    void theRoleComesFromTheDatabaseNotFromTheToken() throws Exception {
        // Jeton émis avec le rôle ADMIN pour un compte qui est USER : /me dit la vérité de la base.
        String forged = jwt.issueAccessToken(alice.getId(), List.of("ADMIN"), null);

        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + forged))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.account.role").value("USER"));
    }
}
