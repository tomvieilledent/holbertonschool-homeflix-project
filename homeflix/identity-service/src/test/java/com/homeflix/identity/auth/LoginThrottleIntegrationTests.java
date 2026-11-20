package com.homeflix.identity.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.homeflix.identity.account.Account;
import com.homeflix.identity.account.AccountRepository;
import com.homeflix.identity.account.Role;
import com.homeflix.identity.account.RoleRepository;

@SpringBootTest(properties = {
        "homeflix.jwt.generate-if-missing=true",
        "homeflix.setup.init-on-startup=false" })
@AutoConfigureMockMvc
@Testcontainers
class LoginThrottleIntegrationTests {

    private static final String PASSWORD = String.join("-", "mot", "de", "passe", "de", "test");
    private static final String WRONG = String.join("-", "mauvais", "mot", "de", "passe");

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
    @Autowired LoginThrottle throttle;

    private String ip;

    @BeforeEach
    void reset() {
        clock.now = Instant.now();
        // Une adresse par test : le compteur par IP ne déborde pas d'un test à l'autre.
        ip = "198.51.100." + (int) (Math.random() * 250 + 1);
        jdbc.update("DELETE FROM accounts");
        accounts.save(new Account("alice", "alice@maison.fr", encoder.encode(PASSWORD), roles.getReferenceById(Role.USER)));
        throttle.reset("alice");
        throttle.reset("inconnu");
    }

    private ResultActions login(String username, String password) throws Exception {
        return mvc.perform(post("/api/v1/auth/login").header("X-Forwarded-For", ip)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"));
    }

    private void failFiveTimes(String username) throws Exception {
        for (int i = 0; i < 5; i++) {
            login(username, WRONG).andExpect(status().isUnauthorized());
        }
    }

    @Test
    void aBurstOfConcurrentAttemptsCannotExceedTheLimit() throws Exception {
        int attempts = 40;
        var pool = java.util.concurrent.Executors.newFixedThreadPool(attempts);
        var ready = new java.util.concurrent.CountDownLatch(attempts);
        var go = new java.util.concurrent.CountDownLatch(1);
        try {
            java.util.List<java.util.concurrent.Future<Integer>> results = new java.util.ArrayList<>();
            for (int i = 0; i < attempts; i++) {
                results.add(pool.submit(() -> {
                    ready.countDown();
                    go.await();
                    return login("alice", WRONG).andReturn().getResponse().getStatus();
                }));
            }
            ready.await();
            go.countDown();
            int unauthorized = 0;
            int limited = 0;
            for (var f : results) {
                int status = f.get();
                if (status == 401) unauthorized++;
                if (status == 429) limited++;
            }
            assertThat(unauthorized).isEqualTo(5);
            assertThat(limited).isEqualTo(attempts - 5);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void afterFiveFailuresTheSixthAttemptGets429WithRetryAfter() throws Exception {
        failFiveTimes("alice");
        login("alice", WRONG).andExpect(status().isTooManyRequests())
            .andExpect(jsonPath("$.code").value("RATE_LIMITED"))
            .andExpect(header().string("Retry-After", "300"));
    }

    @Test
    void lockoutAlsoRefusesTheCorrectPassword() throws Exception {
        failFiveTimes("alice");
        login("alice", PASSWORD).andExpect(status().isTooManyRequests());
    }

    @Test
    void retryAfterShrinksAndTheLockoutExpires() throws Exception {
        failFiveTimes("alice");
        clock.now = clock.now.plus(Duration.ofMinutes(2));
        login("alice", PASSWORD).andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After", "180"));
        clock.now = clock.now.plus(Duration.ofMinutes(3).plusSeconds(1));
        login("alice", PASSWORD).andExpect(status().isOk());
    }

    @Test
    void failuresOlderThanTheWindowDoNotCount() throws Exception {
        for (int i = 0; i < 4; i++) {
            login("alice", WRONG).andExpect(status().isUnauthorized());
        }
        clock.now = clock.now.plus(Duration.ofMinutes(6));
        login("alice", WRONG).andExpect(status().isUnauthorized());
        login("alice", PASSWORD).andExpect(status().isOk());
    }

    @Test
    void aSuccessfulLoginResetsTheCounter() throws Exception {
        for (int i = 0; i < 4; i++) {
            login("alice", WRONG).andExpect(status().isUnauthorized());
        }
        login("alice", PASSWORD).andExpect(status().isOk());
        for (int i = 0; i < 4; i++) {
            login("alice", WRONG).andExpect(status().isUnauthorized());
        }
        login("alice", PASSWORD).andExpect(status().isOk());
    }

    @Test
    void anUnknownAccountIsLockedExactlyLikeAKnownOne() throws Exception {
        failFiveTimes("inconnu");
        login("inconnu", WRONG).andExpect(status().isTooManyRequests())
            .andExpect(jsonPath("$.code").value("RATE_LIMITED"))
            .andExpect(header().string("Retry-After", "300"));
    }

    @Test
    void usernameCaseDoesNotBypassTheLimit() throws Exception {
        failFiveTimes("alice");
        login("ALICE", WRONG).andExpect(status().isTooManyRequests());
    }

    @Test
    void lockingOneAccountDoesNotLockAnotherFromAnotherAddress() throws Exception {
        failFiveTimes("alice");
        String other = "203.0.113." + (int) (Math.random() * 250 + 1);
        mvc.perform(post("/api/v1/auth/login").header("X-Forwarded-For", other)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"bob\",\"password\":\"" + WRONG + "\"}"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void anIpSprayingManyUsernamesGetsLockedAfterTwentyFailures() throws Exception {
        for (int i = 0; i < 20; i++) {
            login("cible" + i, WRONG).andExpect(status().isUnauthorized());
        }
        login("cible-nouvelle", WRONG).andExpect(status().isTooManyRequests());
        assertThat(throttle.begin("autre", ip).blocked()).isTrue();
    }
}
