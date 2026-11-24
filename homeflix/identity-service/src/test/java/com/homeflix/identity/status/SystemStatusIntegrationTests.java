package com.homeflix.identity.status;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
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
import com.homeflix.identity.security.JwtService;
import com.sun.net.httpserver.HttpServer;

/**
 * Agrégateur d'état des services : Library et Acquisition sont simulés par de vrais petits serveurs HTTP, ce qui
 * exerce le chemin réseau complet (connexion refusée, réponse 503, service qui ne répond pas).
 */
@SpringBootTest(properties = {
        "homeflix.jwt.generate-if-missing=true",
        "homeflix.setup.init-on-startup=false" })
@AutoConfigureMockMvc
@Testcontainers
class SystemStatusIntegrationTests {

    private static final String PASSWORD = String.join("-", "mot", "de", "passe", "de", "test");

    /** Faux service : répond à `/actuator/health` comme le fait un vrai service Spring Boot, ou comme on le règle. */
    static class FakeService {
        final int port;
        volatile HttpServer server;
        volatile int code = 200;
        volatile String body = "{\"status\":\"UP\"}";
        volatile long delayMillis;

        FakeService() {
            try (java.net.ServerSocket probe = new java.net.ServerSocket(0)) {
                this.port = probe.getLocalPort();
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
            start();
        }

        void start() {
            try {
                server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
                server.createContext("/actuator/health", exchange -> {
                    if (delayMillis > 0) {
                        try {
                            Thread.sleep(delayMillis);
                        } catch (InterruptedException e) {
                            Thread.currentThread().interrupt();
                        }
                    }
                    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                    exchange.getResponseHeaders().add("Content-Type", "application/json");
                    exchange.sendResponseHeaders(code, bytes.length);
                    try (OutputStream out = exchange.getResponseBody()) {
                        out.write(bytes);
                    }
                });
                server.start();
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        }

        /** Arrête vraiment le service : plus rien n'écoute sur le port (connexion refusée). */
        void stop() {
            server.stop(0);
        }

        void reset() {
            if (server != null) {
                server.stop(0);
            }
            code = 200;
            body = "{\"status\":\"UP\"}";
            delayMillis = 0;
            start();
        }

        String url() {
            return "http://127.0.0.1:" + port;
        }
    }

    static final FakeService LIBRARY = new FakeService();
    static final FakeService ACQUISITION = new FakeService();

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("homeflix.library.url", LIBRARY::url);
        registry.add("homeflix.acquisition.url", ACQUISITION::url);
    }

    @AfterAll
    static void stopServices() {
        LIBRARY.server.stop(0);
        ACQUISITION.server.stop(0);
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired AccountRepository accounts;
    @Autowired RoleRepository roles;
    @Autowired PasswordEncoder encoder;
    @Autowired JwtService jwt;

    String adminToken;
    String userToken;

    @BeforeEach
    void setUp() {
        jdbc.update("DELETE FROM accounts");
        Account admin = accounts.save(new Account("admin", "admin@maison.fr", encoder.encode(PASSWORD), roles.getReferenceById(Role.ADMIN)));
        Account user = accounts.save(new Account("alice", "alice@maison.fr", encoder.encode(PASSWORD), roles.getReferenceById(Role.USER)));
        adminToken = "Bearer " + jwt.issueAccessToken(admin.getId(), List.of(Role.ADMIN), null);
        userToken = "Bearer " + jwt.issueAccessToken(user.getId(), List.of(Role.USER), null);
        LIBRARY.reset();
        ACQUISITION.reset();
    }

    private String fetch() throws Exception {
        MvcResult result = mvc.perform(get("/api/v1/admin/system/status").header("Authorization", adminToken))
            .andExpect(status().isOk()).andReturn();
        return result.getResponse().getContentAsString();
    }

    @Test
    void whenEverythingRunsTheStatusIsUpForEachService() throws Exception {
        mvc.perform(get("/api/v1/admin/system/status").header("Authorization", adminToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("UP"))
            .andExpect(jsonPath("$.checkedAt").isNotEmpty())
            .andExpect(jsonPath("$.services.length()").value(3))
            .andExpect(jsonPath("$.services[0].name").value("identity"))
            .andExpect(jsonPath("$.services[0].status").value("UP"))
            .andExpect(jsonPath("$.services[1].name").value("library"))
            .andExpect(jsonPath("$.services[1].status").value("UP"))
            .andExpect(jsonPath("$.services[2].name").value("acquisition"))
            .andExpect(jsonPath("$.services[2].status").value("UP"));
    }

    @Test
    void aStoppedServiceIsDownAndTheWholeIsDegraded() throws Exception {
        ACQUISITION.stop();
        mvc.perform(get("/api/v1/admin/system/status").header("Authorization", adminToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("DEGRADED"))
            .andExpect(jsonPath("$.services[0].status").value("UP"))
            .andExpect(jsonPath("$.services[1].status").value("UP"))
            .andExpect(jsonPath("$.services[2].name").value("acquisition"))
            .andExpect(jsonPath("$.services[2].status").value("DOWN"));
    }

    @Test
    void aServiceThatReportsItsDatabaseDownIsDown() throws Exception {
        LIBRARY.code = 503;
        LIBRARY.body = "{\"status\":\"DOWN\"}";
        mvc.perform(get("/api/v1/admin/system/status").header("Authorization", adminToken))
            .andExpect(jsonPath("$.status").value("DEGRADED"))
            .andExpect(jsonPath("$.services[1].name").value("library"))
            .andExpect(jsonPath("$.services[1].status").value("DOWN"))
            .andExpect(jsonPath("$.services[2].status").value("UP"));
    }

    @Test
    void anAnswerThatIsNotUpIsDownEvenWithHttp200() throws Exception {
        LIBRARY.body = "{\"status\":\"OUT_OF_SERVICE\"}";
        ACQUISITION.body = "pas du json";
        mvc.perform(get("/api/v1/admin/system/status").header("Authorization", adminToken))
            .andExpect(jsonPath("$.status").value("DEGRADED"))
            .andExpect(jsonPath("$.services[1].status").value("DOWN"))
            .andExpect(jsonPath("$.services[2].status").value("DOWN"));
    }

    @Test
    void bothServicesDownStillAnswersDegradedNotAnError() throws Exception {
        LIBRARY.stop();
        ACQUISITION.stop();
        mvc.perform(get("/api/v1/admin/system/status").header("Authorization", adminToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("DEGRADED"))
            .andExpect(jsonPath("$.services[0].status").value("UP"))
            .andExpect(jsonPath("$.services[1].status").value("DOWN"))
            .andExpect(jsonPath("$.services[2].status").value("DOWN"));
    }

    @Test
    void aServiceThatDoesNotAnswerIsDownWithinTheTimeLimitAndTheOthersAreNotDelayed() throws Exception {
        ACQUISITION.delayMillis = 8_000;
        long start = System.nanoTime();
        mvc.perform(get("/api/v1/admin/system/status").header("Authorization", adminToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("DEGRADED"))
            .andExpect(jsonPath("$.services[1].status").value("UP"))
            .andExpect(jsonPath("$.services[2].status").value("DOWN"));
        long elapsedMillis = (System.nanoTime() - start) / 1_000_000;
        assertThat(elapsedMillis).as("la réponse ne doit pas attendre le service bloqué").isLessThan(4_500);
    }

    @Test
    void theResponseCarriesNoTechnicalDetail() throws Exception {
        ACQUISITION.stop();
        LIBRARY.code = 503;
        LIBRARY.body = "{\"status\":\"DOWN\",\"details\":{\"db\":\"jdbc:postgresql://secret:5432/library\"}}";
        String json = fetch();
        assertThat(json).doesNotContain("127.0.0.1", "localhost", String.valueOf(LIBRARY.port), String.valueOf(ACQUISITION.port),
            "jdbc", "secret", "Exception", "actuator", "Connection refused");
        assertThat(json).contains("\"status\"", "\"services\"", "\"checkedAt\"");
    }

    @Test
    void onlyAnAdministratorMayReadTheStatus() throws Exception {
        mvc.perform(get("/api/v1/admin/system/status")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/admin/system/status").header("Authorization", userToken)).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/system/status").header("Authorization", adminToken)).andExpect(status().isOk());
    }
}
