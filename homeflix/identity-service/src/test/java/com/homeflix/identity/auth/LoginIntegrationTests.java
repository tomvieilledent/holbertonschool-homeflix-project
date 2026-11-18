package com.homeflix.identity.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.homeflix.identity.account.Account;
import com.homeflix.identity.account.AccountRepository;
import com.homeflix.identity.account.Role;
import com.homeflix.identity.account.RoleRepository;

@SpringBootTest(properties = {
        "homeflix.jwt.generate-if-missing=true",
        "homeflix.setup.init-on-startup=false",
        "homeflix.auth.cookie-secure=true" })
@AutoConfigureMockMvc
@Testcontainers
class LoginIntegrationTests {

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
    @Autowired JwtDecoder decoder;

    @BeforeEach
    void reset() {
        jdbc.update("DELETE FROM accounts");
        accounts.save(new Account("alice", "alice@maison.fr", encoder.encode(PASSWORD), roles.getReferenceById(Role.USER)));
    }

    private MvcResult login(String username, String password) throws Exception {
        return mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}")).andReturn();
    }

    @Test
    void validCredentialsReturnAnAccessTokenAndAHardenedRefreshCookie() throws Exception {
        MvcResult result = login("alice", PASSWORD);
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"alice\",\"password\":\"" + PASSWORD + "\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.tokenType").value("Bearer"))
            .andExpect(jsonPath("$.expiresIn").value(900))
            .andExpect(jsonPath("$.refreshToken").doesNotExist());

        var jwt = decoder.decode(tokenOf(result));
        assertThat(jwt.getClaimAsStringList("roles")).containsExactly("USER");
        assertThat(jwt.hasClaim("pid")).isFalse();

        String cookie = result.getResponse().getHeader(HttpHeaders.SET_COOKIE);
        assertThat(cookie).startsWith("refresh_token=")
            .contains("HttpOnly").contains("Secure").contains("SameSite=Strict").contains("Path=/api/v1/auth");
    }

    @Test
    void onlyTheHashOfTheRefreshTokenIsStored() throws Exception {
        MvcResult result = login("alice", PASSWORD);
        String cookie = result.getResponse().getHeader(HttpHeaders.SET_COOKIE);
        String value = cookie.substring("refresh_token=".length(), cookie.indexOf(';'));
        String stored = jdbc.queryForObject("SELECT token_hash FROM refresh_tokens", String.class);
        assertThat(stored).hasSize(64).isEqualTo(RefreshTokens.hash(value)).isNotEqualTo(value);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM refresh_tokens WHERE expires_at > now() AND revoked_at IS NULL",
            Integer.class)).isEqualTo(1);
    }

    @Test
    void unknownAccountAndWrongPasswordGetTheSameGeneric401() throws Exception {
        MvcResult unknown = login("personne", PASSWORD);
        MvcResult wrong = login("alice", "mauvais-mot-de-passe");
        assertThat(unknown.getResponse().getStatus()).isEqualTo(401);
        assertThat(wrong.getResponse().getStatus()).isEqualTo(401);
        assertThat(unknown.getResponse().getContentAsString()).isEqualTo(wrong.getResponse().getContentAsString());
        assertThat(unknown.getResponse().getContentType()).startsWith("application/problem+json");
        assertThat(unknown.getResponse().getContentAsString()).contains("AUTH_INVALID_CREDENTIALS");
        assertThat(unknown.getResponse().getHeader(HttpHeaders.SET_COOKIE)).isNull();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM refresh_tokens", Integer.class)).isZero();
    }

    @Test
    void disabledAccountIsRefusedWith403() throws Exception {
        jdbc.update("UPDATE accounts SET enabled = false WHERE username = 'alice'");
        MvcResult result = login("alice", PASSWORD);
        assertThat(result.getResponse().getStatus()).isEqualTo(403);
        assertThat(result.getResponse().getContentAsString()).contains("ACCOUNT_DISABLED");
        assertThat(result.getResponse().getHeader(HttpHeaders.SET_COOKIE)).isNull();
    }

    @Test
    void aDisabledAccountWithAWrongPasswordDoesNotRevealThatItExists() throws Exception {
        jdbc.update("UPDATE accounts SET enabled = false WHERE username = 'alice'");
        assertThat(login("alice", "mauvais-mot-de-passe").getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void emptyFieldsGet400() throws Exception {
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"\",\"password\":\"\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    private static String tokenOf(MvcResult result) throws Exception {
        String body = result.getResponse().getContentAsString();
        int i = body.indexOf("\"accessToken\":\"") + "\"accessToken\":\"".length();
        return body.substring(i, body.indexOf('"', i));
    }
}
