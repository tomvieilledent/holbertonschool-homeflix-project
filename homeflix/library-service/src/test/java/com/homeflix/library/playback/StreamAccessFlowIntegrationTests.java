package com.homeflix.library.playback;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/** Flux de lecture sans ticket valide, et d'un média retiré ou indisponible (issue #98). */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class StreamAccessFlowIntegrationTests {

    @TempDir
    static Path root;

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("identity.jwks-uri", () -> "http://identity-service:8081/.well-known/jwks.json");
        registry.add("library.allowed-bases", () -> root.toString());
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired StreamTicketService tickets;

    final UUID rootId = UUID.randomUUID();
    final UUID media = UUID.randomUUID();

    @BeforeEach
    void setUp() throws Exception {
        Files.write(root.resolve("film.mp4"), new byte[100]);
        jdbc.update("insert into media_roots (id, path, label) values (?, ?, 'test')", rootId, root.toString());
        jdbc.update("""
            insert into media_items (id, root_id, relative_path, size_bytes, file_mtime, fingerprint, availability, last_seen_at, deleted)
            values (?, ?, 'film.mp4', 100, now(), 'f', 'AVAILABLE', now(), false)""", media, rootId);
        jdbc.update("insert into media_metadata (media_id, title, genres) values (?, 'Film', '{}')", media);
    }

    @AfterEach
    void clean() {
        jdbc.update("delete from media_items");
        jdbc.update("delete from media_roots");
    }

    private String ticket() {
        return tickets.issue(UUID.randomUUID(), UUID.randomUUID(), media).token();
    }

    @Test
    void aValidTicketStreams() throws Exception {
        mvc.perform(get("/api/v1/stream/" + media + "?t=" + ticket())).andExpect(status().isOk());
    }

    @Test
    void anAuthenticatedUserWithoutATicketIsRefused() throws Exception {
        // Le jeton d'accès seul ne donne pas la lecture : il faut le ticket délivré pour CE média.
        mvc.perform(get("/api/v1/stream/" + media).with(jwt().jwt(j -> j.subject(UUID.randomUUID().toString())
                .claim("roles", List.of("USER")).claim("pid", UUID.randomUUID().toString()))))
            .andExpect(status().isForbidden());
    }

    @Test
    void aTicketCannotBeSentInAnotherWay() throws Exception {
        int code = mvc.perform(get("/api/v1/stream/" + media).header("Authorization", "Bearer " + ticket()))
            .andReturn().getResponse().getStatus();
        org.assertj.core.api.Assertions.assertThat(code).isIn(401, 403);
        mvc.perform(get("/api/v1/stream/" + media + "?t=")).andExpect(status().isForbidden());
    }

    @Test
    void aTicketWithATamperedSignatureIsRefused() throws Exception {
        String token = ticket();
        String tampered = token.substring(0, token.length() - 4) + (token.endsWith("AAAA") ? "BBBB" : "AAAA");
        mvc.perform(get("/api/v1/stream/" + media + "?t=" + tampered)).andExpect(status().isForbidden());
    }

    @Test
    void aMediaRemovedAfterTheTicketWasIssuedIsNoLongerServed() throws Exception {
        String token = ticket();
        jdbc.update("update media_items set deleted = true where id = ?", media);
        int code = mvc.perform(get("/api/v1/stream/" + media + "?t=" + token)).andReturn().getResponse().getStatus();
        org.assertj.core.api.Assertions.assertThat(code).isIn(404, 409);
    }

    @Test
    void aMediaNoLongerAvailableAfterTheTicketWasIssuedIsNoLongerServed() throws Exception {
        String token = ticket();
        jdbc.update("update media_items set availability = 'UNAVAILABLE' where id = ?", media);
        int code = mvc.perform(get("/api/v1/stream/" + media + "?t=" + token)).andReturn().getResponse().getStatus();
        org.assertj.core.api.Assertions.assertThat(code).isIn(404, 409);
    }
}
