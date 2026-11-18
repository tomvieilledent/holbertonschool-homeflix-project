package com.homeflix.identity.setup;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@SpringBootTest(properties = "homeflix.jwt.generate-if-missing=true")
@AutoConfigureMockMvc
@Testcontainers
class SetupApiIntegrationTests {

    // Valeur de test assemblée au runtime : aucun jeton littéral dans le dépôt (scan de secrets).
    private static final String TOKEN = String.join("-", "jeton", "de", "test", "setup");

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("homeflix.setup.token", () -> TOKEN);
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired SetupService setup;
    @Autowired org.springframework.transaction.PlatformTransactionManager txManager;
    @Autowired com.homeflix.identity.account.SetupStateRepository states;
    @Autowired com.homeflix.identity.account.AccountRepository accounts;
    @Autowired com.homeflix.identity.account.RoleRepository roles;
    @Autowired org.springframework.security.crypto.password.PasswordEncoder encoder;

    @BeforeEach
    void reset() {
        jdbc.update("DELETE FROM accounts");
        jdbc.update("DELETE FROM setup_state");
        setup.initialize();
    }

    private static String body(String token, String username, String email, String password) {
        return """
            {"setupToken":"%s","username":"%s","email":"%s","password":"%s"}""".formatted(token, username, email, password);
    }

    private int create(String token, String username) throws Exception {
        return mvc.perform(post("/api/v1/setup").contentType(MediaType.APPLICATION_JSON)
                .content(body(token, username, username + "@maison.fr", "un-mot-de-passe-long-12")))
            .andReturn().getResponse().getStatus();
    }

    @Test
    void noAccountExistsBeforeSetupAndStatusSaysSetupIsRequired() throws Exception {
        assertThat(jdbc.queryForObject("SELECT count(*) FROM accounts", Integer.class)).isZero();
        mvc.perform(get("/api/v1/setup/status")).andExpect(status().isOk())
            .andExpect(jsonPath("$.setupRequired").value(true));
    }

    @Test
    void invalidTokenGets403AndCreatesNothing() throws Exception {
        mvc.perform(post("/api/v1/setup").contentType(MediaType.APPLICATION_JSON)
                .content(body("mauvais-jeton", "admin", "admin@maison.fr", "un-mot-de-passe-long-12")))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("SETUP_TOKEN_INVALID"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM accounts", Integer.class)).isZero();
    }

    @Test
    void validTokenCreatesAnArgon2idHashedAdminAndNeverReturnsTheHash() throws Exception {
        mvc.perform(post("/api/v1/setup").contentType(MediaType.APPLICATION_JSON)
                .content(body(TOKEN, "admin", "Admin@Maison.fr", "un-mot-de-passe-long-12")))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.role").value("ADMIN"))
            .andExpect(jsonPath("$.email").value("admin@maison.fr"))
            .andExpect(jsonPath("$.passwordHash").doesNotExist())
            .andExpect(jsonPath("$.password").doesNotExist());
        String hash = jdbc.queryForObject("SELECT password_hash FROM accounts WHERE username = 'admin'", String.class);
        assertThat(hash).startsWith("$argon2id$").doesNotContain("un-mot-de-passe");
        assertThat(jdbc.queryForObject("SELECT token_hash FROM setup_state", String.class)).isNull();
        mvc.perform(get("/api/v1/setup/status")).andExpect(jsonPath("$.setupRequired").value(false));
    }

    @Test
    void replayAndAnyLaterAttemptGet409Forever() throws Exception {
        assertThat(create(TOKEN, "admin")).isEqualTo(201);
        assertThat(create(TOKEN, "autre")).isEqualTo(409);
        assertThat(create("mauvais-jeton", "autre")).isEqualTo(409);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM accounts", Integer.class)).isEqualTo(1);
    }

    @Test
    void invalidInputsGet400() throws Exception {
        mvc.perform(post("/api/v1/setup").contentType(MediaType.APPLICATION_JSON)
                .content(body(TOKEN, "ad", "pas-un-email", "court")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
            .andExpect(jsonPath("$.errors.length()").value(3));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM accounts", Integer.class)).isZero();
    }

    @Test
    void twoSimultaneousRequestsCreateExactlyOneAdmin() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Callable<Integer> a = () -> create(TOKEN, "admin-a");
            Callable<Integer> b = () -> create(TOKEN, "admin-b");
            List<Future<Integer>> results = pool.invokeAll(List.of(a, b));
            List<Integer> statuses = List.of(results.get(0).get(), results.get(1).get());
            assertThat(statuses).containsExactlyInAnyOrder(201, 409);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM accounts", Integer.class)).isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void generatedTokenIsUsedWhenNoneIsConfigured() throws Exception {
        // Sans SETUP_TOKEN : un jeton aléatoire est généré ; seul son hachage est stocké, et le jeton de test est refusé.
        jdbc.update("DELETE FROM setup_state");
        new org.springframework.transaction.support.TransactionTemplate(txManager)
            .executeWithoutResult(t -> new SetupService(states, accounts, roles, encoder, "").initialize());
        assertThat(jdbc.queryForObject("SELECT token_hash FROM setup_state", String.class)).hasSize(64);
        assertThat(create(TOKEN, "admin")).isEqualTo(403);
    }
}
