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
class ChangePasswordIntegrationTests {

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
    @Autowired RoleRepository roles;
    @Autowired PasswordEncoder encoder;

    private static final String NEW_PASSWORD = String.join("-", "nouveau", "mot", "de", "passe");

    @BeforeEach
    void reset() {
        jdbc.update("DELETE FROM accounts");
        Account alice = new Account("alice", "alice@maison.fr", encoder.encode(PASSWORD), roles.getReferenceById(Role.USER));
        alice.setMustChangePassword(true);
        accounts.save(alice);
    }

    private String login(String password) throws Exception {
        MvcResult r = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"alice\",\"password\":\"" + password + "\"}")).andReturn();
        return r.getResponse().getContentAsString().replaceAll(".*\"accessToken\":\"([^\"]+)\".*", "$1");
    }

    private MvcResult change(String token, String current, String next) throws Exception {
        return mvc.perform(post("/api/v1/auth/change-password").header("Authorization", "Bearer " + token)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"currentPassword\":\"" + current + "\",\"newPassword\":\"" + next + "\"}")).andReturn();
    }

    @Test
    void aTemporaryPasswordTokenCanOnlyReachMeAndChangePassword() throws Exception {
        String token = login(PASSWORD);
        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + token)).andExpect(status().isOk());
        mvc.perform(get("/api/v1/profiles").header("Authorization", "Bearer " + token)).andExpect(status().isForbidden());
        assertThat(change(token, PASSWORD, NEW_PASSWORD).getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void changingThePasswordClearsTheFlagAndRestoresAccess() throws Exception {
        String token = login(PASSWORD);
        MvcResult r = change(token, PASSWORD, NEW_PASSWORD);
        String fresh = r.getResponse().getContentAsString().replaceAll(".*\"accessToken\":\"([^\"]+)\".*", "$1");
        assertThat(r.getResponse().getHeader("Set-Cookie")).contains("refresh_token=");
        mvc.perform(get("/api/v1/profiles").header("Authorization", "Bearer " + fresh)).andExpect(status().isOk());
        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + fresh))
            .andExpect(jsonPath("$.account.mustChangePassword").value(false));
        // L'ancien mot de passe ne fonctionne plus, le nouveau oui.
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"alice\",\"password\":\"" + PASSWORD + "\"}")).andExpect(status().isUnauthorized());
        assertThat(login(NEW_PASSWORD)).isNotBlank();
    }

    @Test
    void wrongCurrentPasswordOrSamePasswordOrWeakPasswordIsRefused() throws Exception {
        String token = login(PASSWORD);
        assertThat(change(token, "mauvais", NEW_PASSWORD).getResponse().getStatus()).isEqualTo(400);
        assertThat(change(token, PASSWORD, PASSWORD).getResponse().getStatus()).isEqualTo(400);
        assertThat(change(token, PASSWORD, "court").getResponse().getStatus()).isEqualTo(400);
    }
}
