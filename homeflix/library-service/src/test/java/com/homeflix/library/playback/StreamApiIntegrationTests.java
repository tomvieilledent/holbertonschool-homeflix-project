package com.homeflix.library.playback;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Files;
import java.nio.file.Path;
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
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class StreamApiIntegrationTests {

    static final int SIZE = 1000;

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

    UUID rootId = UUID.randomUUID();
    UUID mediaId = UUID.randomUUID();
    UUID missingId = UUID.randomUUID();
    byte[] content = new byte[SIZE];

    private UUID add(UUID id, String path, String availability) {
        jdbc.update("""
            insert into media_items (id, root_id, relative_path, size_bytes, file_mtime, fingerprint, availability, last_seen_at, deleted)
            values (?, ?, ?, ?, now(), 'f', ?, now(), false)""", id, rootId, path, SIZE, availability);
        jdbc.update("insert into media_metadata (media_id, title, genres) values (?, 'Film', '{}')", id);
        return id;
    }

    @BeforeEach
    void setUp() throws Exception {
        for (int i = 0; i < SIZE; i++) {
            content[i] = (byte) (i % 251);
        }
        Files.write(root.resolve("film.mp4"), content);
        jdbc.update("insert into media_roots (id, path, label) values (?, ?, 'test')", rootId, root.toString());
        add(mediaId, "film.mp4", "AVAILABLE");
        add(missingId, "absent.mp4", "AVAILABLE");
    }

    @AfterEach
    void clean() {
        jdbc.update("delete from media_items");
        jdbc.update("delete from media_roots");
    }

    private String url(UUID id) {
        return "/api/v1/stream/" + id + "?t=" + tickets.issue(UUID.randomUUID(), UUID.randomUUID(), id).token();
    }

    private ResultActions range(String value) throws Exception {
        return mvc.perform(get(url(mediaId)).header("Range", value));
    }

    @Test
    void withoutRangeTheWholeFileIsServedWith200() throws Exception {
        mvc.perform(get(url(mediaId))).andExpect(status().isOk())
            .andExpect(header().string("Accept-Ranges", "bytes"))
            .andExpect(header().string("Content-Type", "video/mp4"))
            .andExpect(header().longValue("Content-Length", SIZE));
    }

    @Test
    void closedRangeGets206WithExactlyThoseBytes() throws Exception {
        var body = range("bytes=0-99").andExpect(status().isPartialContent())
            .andExpect(header().string("Content-Range", "bytes 0-99/" + SIZE))
            .andExpect(header().longValue("Content-Length", 100))
            .andReturn().getResponse().getContentAsByteArray();
        org.assertj.core.api.Assertions.assertThat(body).isEqualTo(java.util.Arrays.copyOfRange(content, 0, 100));
    }

    @Test
    void openEndedRangeReachesTheEndOfTheFile() throws Exception {
        var body = range("bytes=900-").andExpect(status().isPartialContent())
            .andExpect(header().string("Content-Range", "bytes 900-999/" + SIZE))
            .andReturn().getResponse().getContentAsByteArray();
        org.assertj.core.api.Assertions.assertThat(body).isEqualTo(java.util.Arrays.copyOfRange(content, 900, SIZE));
    }

    @Test
    void suffixRangeReturnsTheLastBytes() throws Exception {
        range("bytes=-50").andExpect(status().isPartialContent())
            .andExpect(header().string("Content-Range", "bytes 950-999/" + SIZE))
            .andExpect(header().longValue("Content-Length", 50));
    }

    @Test
    void endBeyondTheFileIsClamped() throws Exception {
        range("bytes=990-5000").andExpect(status().isPartialContent())
            .andExpect(header().string("Content-Range", "bytes 990-999/" + SIZE));
    }

    @Test
    void invalidOutOfBoundsAndMultipleRangesGet416WithContentRange() throws Exception {
        for (String bad : new String[] {"bytes=1000-", "bytes=5000-6000", "bytes=50-10", "bytes=abc", "items=0-5",
                "bytes=0-10,20-30"}) {
            range(bad).andExpect(status().isRequestedRangeNotSatisfiable())
                .andExpect(header().string("Content-Range", "bytes */" + SIZE))
                .andExpect(jsonPath("$.code").value("RANGE_NOT_SATISFIABLE"));
        }
    }

    @Test
    void missingOrInvalidTicketIsRefusedAndTicketIsBoundToOneMedia() throws Exception {
        mvc.perform(get("/api/v1/stream/" + mediaId)).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/stream/" + mediaId + "?t=nimportequoi")).andExpect(status().isForbidden());
        String other = tickets.issue(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID()).token();
        mvc.perform(get("/api/v1/stream/" + mediaId + "?t=" + other)).andExpect(status().isForbidden());
    }

    @Test
    void missingFileGets404WithoutExposingThePath() throws Exception {
        mvc.perform(get(url(missingId))).andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("MEDIA_FILE_MISSING"))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content()
                .string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString(root.toString()))));
    }
}
