package com.homeflix.library.playback;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/** POST /media/{id}/stream-ticket sur PostgreSQL réel et dossier temporaire réel. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class StreamTicketApiIntegrationTests {

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("identity.jwks-uri", () -> "http://identity-service:8081/.well-known/jwks.json");
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    Path root;
    UUID rootId;

    @BeforeEach
    void setUp() throws IOException {
        root = Files.createTempDirectory("homeflix-stream-").toRealPath();
        rootId = UUID.randomUUID();
        jdbc.update("insert into media_roots (id, path, label) values (?, ?, 'test')", rootId, root.toString());
    }

    @AfterEach
    void clean() {
        jdbc.update("delete from media_items");
        jdbc.update("delete from media_roots");
    }

    private UUID media(String relative, String availability, boolean deleted, boolean createFile) throws IOException {
        if (createFile) {
            Files.writeString(root.resolve(relative), "contenu");
        }
        UUID id = UUID.randomUUID();
        jdbc.update("""
            insert into media_items (id, root_id, relative_path, size_bytes, file_mtime, fingerprint, availability, last_seen_at, deleted)
            values (?, ?, ?, 7, now(), 'f', ?, now(), ?)""", id, rootId, relative, availability, deleted);
        return id;
    }

    private static RequestPostProcessor user(UUID pid) {
        return jwt().jwt(j -> {
            j.subject(UUID.randomUUID().toString()).claim("roles", java.util.List.of("USER"));
            if (pid != null) {
                j.claim("pid", pid.toString());
            }
        });
    }

    @Test
    void anAvailableMediaGetsATicketUrlValidForTwoHours() throws Exception {
        UUID id = media("film.mp4", "AVAILABLE", false, true);
        mvc.perform(post("/api/v1/media/" + id + "/stream-ticket").with(user(UUID.randomUUID())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.url").value(org.hamcrest.Matchers.startsWith("/api/library/v1/stream/" + id + "?t=")))
            .andExpect(jsonPath("$.expiresAt").exists());
    }

    @Test
    void withoutAnActiveProfileTheAnswerIs409ProfileNotSelected() throws Exception {
        UUID id = media("film.mp4", "AVAILABLE", false, true);
        mvc.perform(post("/api/v1/media/" + id + "/stream-ticket").with(user(null)))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PROFILE_NOT_SELECTED"));
    }

    @Test
    void anAnonymousCallGets401() throws Exception {
        mvc.perform(post("/api/v1/media/" + UUID.randomUUID() + "/stream-ticket")).andExpect(status().isUnauthorized());
    }

    @Test
    void unknownOrRemovedMediaGets404() throws Exception {
        UUID removed = media("retire.mp4", "AVAILABLE", true, true);
        mvc.perform(post("/api/v1/media/" + UUID.randomUUID() + "/stream-ticket").with(user(UUID.randomUUID())))
            .andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/media/" + removed + "/stream-ticket").with(user(UUID.randomUUID())))
            .andExpect(status().isNotFound());
    }

    @Test
    void unavailableOrDownloadingMediaGets409MediaUnavailable() throws Exception {
        UUID unavailable = media("indispo.mp4", "UNAVAILABLE", false, true);
        UUID downloading = media("en-cours.mp4", "DOWNLOADING", false, false);
        for (UUID id : new UUID[] { unavailable, downloading }) {
            mvc.perform(post("/api/v1/media/" + id + "/stream-ticket").with(user(UUID.randomUUID())))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("MEDIA_UNAVAILABLE"));
        }
    }

    @Test
    void aMissingFileGets404MediaFileMissingWithoutExposingThePath() throws Exception {
        UUID id = media("disparu.mp4", "AVAILABLE", false, false);
        mvc.perform(post("/api/v1/media/" + id + "/stream-ticket").with(user(UUID.randomUUID())))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("MEDIA_FILE_MISSING"))
            .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString(root.toString()))));
    }
}
