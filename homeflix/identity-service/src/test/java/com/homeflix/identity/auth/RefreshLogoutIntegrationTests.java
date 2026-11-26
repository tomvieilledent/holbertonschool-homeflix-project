package com.homeflix.identity.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
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
import com.homeflix.identity.account.Role;
import com.homeflix.identity.account.RoleRepository;

import jakarta.servlet.http.Cookie;

@SpringBootTest(properties = {
        "homeflix.jwt.generate-if-missing=true",
        "homeflix.setup.init-on-startup=false" })
@AutoConfigureMockMvc
@Testcontainers
class RefreshLogoutIntegrationTests {

    private static final String PASSWORD = String.join("-", "mot", "de", "passe", "de", "test");

    /** Horloge réglable : permet de tester l'expiration sans attendre. */
    static class MutableClock extends Clock {
        volatile Instant now = Instant.now();

        @Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(java.time.ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    @TestConfiguration
    static class ClockOverride {
        @Bean @Primary MutableClock testClock() { return new MutableClock(); }
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
    @Autowired RoleRepository roles;
    @Autowired PasswordEncoder encoder;
    @Autowired MutableClock clock;
    @Autowired com.homeflix.identity.account.ProfileRepository profiles;

    @BeforeEach
    void reset() {
        clock.now = Instant.now();
        jdbc.update("DELETE FROM accounts");
        accounts.save(new Account("alice", "alice@maison.fr", encoder.encode(PASSWORD), roles.getReferenceById(Role.USER)));
    }

    private static String cookieValue(MvcResult r) {
        String header = r.getResponse().getHeader(HttpHeaders.SET_COOKIE);
        return header.substring("refresh_token=".length(), header.indexOf(';'));
    }

    private String login() throws Exception {
        MvcResult r = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"alice\",\"password\":\"" + PASSWORD + "\"}")).andReturn();
        return cookieValue(r);
    }

    private MvcResult refresh(String token) throws Exception {
        var req = post("/api/v1/auth/refresh").header("X-Requested-With", "homeflix");
        if (token != null) {
            req = req.cookie(new Cookie("refresh_token", token));
        }
        return mvc.perform(req).andReturn();
    }

    @Test
    void refreshRotatesTheTokenAndIssuesANewAccessToken() throws Exception {
        String first = login();
        MvcResult r = refresh(first);
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        assertThat(r.getResponse().getContentAsString()).contains("accessToken", "Bearer");
        String second = cookieValue(r);
        assertThat(second).isNotEqualTo(first);
        assertThat(r.getResponse().getHeader(HttpHeaders.SET_COOKIE)).contains("HttpOnly", "SameSite=Strict", "Path=/api/v1/auth");
        assertThat(refresh(second).getResponse().getStatus()).isEqualTo(200); // le nouveau jeton fonctionne
    }

    @Test
    void refreshKeepsTheActiveProfileSelectedBefore() throws Exception {
        Account alice = accounts.findByUsername("alice").orElseThrow();
        var profile = profiles.save(new com.homeflix.identity.account.Profile(alice, "Alice", "avatar-1"));
        MvcResult login = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"alice\",\"password\":\"" + PASSWORD + "\"}")).andReturn();
        String access = jsonField(login, "accessToken");
        MvcResult select = mvc.perform(post("/api/v1/profiles/" + profile.getId() + "/select")
            .header("Authorization", "Bearer " + access).header("X-Requested-With", "homeflix")).andReturn();
        assertThat(select.getResponse().getStatus()).isEqualTo(200);

        MvcResult refreshed = refresh(cookieValue(login));
        assertThat(refreshed.getResponse().getStatus()).isEqualTo(200);
        String me = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/auth/me")
            .header("Authorization", "Bearer " + jsonField(refreshed, "accessToken"))).andReturn().getResponse().getContentAsString();
        assertThat(me).contains(profile.getId().toString());
    }

    @Test
    void selectCannotExtendAccessAfterLogout() throws Exception {
        Account alice = accounts.findByUsername("alice").orElseThrow();
        var profile = profiles.save(new com.homeflix.identity.account.Profile(alice, "Alice", "avatar-1"));
        MvcResult login = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"alice\",\"password\":\"" + PASSWORD + "\"}")).andReturn();
        mvc.perform(post("/api/v1/auth/logout").header("X-Requested-With", "homeflix")
            .cookie(new jakarta.servlet.http.Cookie("refresh_token", cookieValue(login))));

        MvcResult select = mvc.perform(post("/api/v1/profiles/" + profile.getId() + "/select")
            .header("Authorization", "Bearer " + jsonField(login, "accessToken"))).andReturn();

        assertThat(select.getResponse().getStatus()).isEqualTo(401);
    }

    private static String jsonField(MvcResult r, String field) throws Exception {
        var m = java.util.regex.Pattern.compile("\"" + field + "\"\\s*:\\s*\"([^\"]+)\"").matcher(r.getResponse().getContentAsString());
        assertThat(m.find()).isTrue();
        return m.group(1);
    }

    @Test
    void replayingAnOldTokenIsRefusedAndRevokesTheWholeFamily() throws Exception {
        String first = login();
        String second = cookieValue(refresh(first));
        MvcResult replay = refresh(first);
        assertThat(replay.getResponse().getStatus()).isEqualTo(401);
        assertThat(replay.getResponse().getContentAsString()).contains("SESSION_EXPIRED");
        // Le jeton légitime de la même famille est désormais révoqué lui aussi.
        assertThat(refresh(second).getResponse().getStatus()).isEqualTo(401);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM refresh_tokens WHERE revoked_at IS NULL", Integer.class)).isZero();
    }

    @Test
    void anExpiredRefreshTokenGets401SessionExpired() throws Exception {
        String token = login();
        clock.now = clock.now.plus(Duration.ofDays(8));
        MvcResult r = refresh(token);
        assertThat(r.getResponse().getStatus()).isEqualTo(401);
        assertThat(r.getResponse().getContentAsString()).contains("SESSION_EXPIRED");
    }

    @Test
    void missingOrUnknownTokenGets401() throws Exception {
        assertThat(refresh(null).getResponse().getStatus()).isEqualTo(401);
        assertThat(refresh("inconnu").getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void theCsrfHeaderIsMandatoryOnRefreshAndLogout() throws Exception {
        String token = login();
        assertThat(mvc.perform(post("/api/v1/auth/refresh").cookie(new Cookie("refresh_token", token))).andReturn()
            .getResponse().getStatus()).isEqualTo(403);
        assertThat(mvc.perform(post("/api/v1/auth/refresh").header("X-Requested-With", "autre")
            .cookie(new Cookie("refresh_token", token))).andReturn().getResponse().getStatus()).isEqualTo(403);
        assertThat(mvc.perform(post("/api/v1/auth/logout").cookie(new Cookie("refresh_token", token))).andReturn()
            .getResponse().getStatus()).isEqualTo(403);
        assertThat(refresh(token).getResponse().getStatus()).isEqualTo(200); // le jeton n'a pas été consommé
    }

    @Test
    void afterLogoutTheRefreshTokenIsUnusableAndTheCookieIsCleared() throws Exception {
        String token = login();
        MvcResult out = mvc.perform(post("/api/v1/auth/logout").header("X-Requested-With", "homeflix")
            .cookie(new Cookie("refresh_token", token))).andReturn();
        assertThat(out.getResponse().getStatus()).isEqualTo(204);
        assertThat(out.getResponse().getHeader(HttpHeaders.SET_COOKIE)).contains("Max-Age=0");
        assertThat(refresh(token).getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void logoutIsIdempotent() throws Exception {
        for (int i = 0; i < 2; i++) {
            assertThat(mvc.perform(post("/api/v1/auth/logout").header("X-Requested-With", "homeflix")).andReturn()
                .getResponse().getStatus()).isEqualTo(204);
        }
    }

    @Test
    void disablingTheAccountStopsRefreshAndRevokesTheSession() throws Exception {
        String token = login();
        jdbc.update("UPDATE accounts SET enabled = false WHERE username = 'alice'");
        MvcResult r = refresh(token);
        assertThat(r.getResponse().getStatus()).isEqualTo(403);
        assertThat(r.getResponse().getContentAsString()).contains("ACCOUNT_DISABLED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM refresh_tokens WHERE revoked_at IS NULL", Integer.class)).isZero();
    }

    @Test
    void twoSimultaneousRefreshesWithTheSameTokenYieldOneSuccess() throws Exception {
        String token = login();
        var pool = Executors.newFixedThreadPool(2);
        try {
            Callable<Integer> call = () -> refresh(token).getResponse().getStatus();
            List<Future<Integer>> results = pool.invokeAll(List.of(call, call));
            assertThat(List.of(results.get(0).get(), results.get(1).get())).containsExactlyInAnyOrder(200, 401);
        } finally {
            pool.shutdownNow();
        }
    }
}
