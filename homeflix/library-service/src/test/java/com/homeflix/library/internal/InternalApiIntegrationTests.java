package com.homeflix.library.internal;

import static org.assertj.core.api.Assertions.assertThat;
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
import org.springframework.http.MediaType;
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
class InternalApiIntegrationTests {

    private static final String KEY = String.join("-", "cle", "interne", "de", "test");

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    static final Path DOWNLOADS = tempDir();

    private static Path tempDir() {
        try {
            return Files.createTempDirectory("homeflix-downloads-").toRealPath();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("identity.jwks-uri", () -> "http://identity-service:8081/.well-known/jwks.json");
        registry.add("homeflix.internal.api-key", () -> KEY);
        registry.add("library.downloads-root", DOWNLOADS::toString);
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    UUID rootId;
    UUID media;
    final UUID account = UUID.randomUUID();
    final UUID lea = UUID.randomUUID();
    final UUID tom = UUID.randomUUID();
    final UUID otherAccount = UUID.randomUUID();
    final UUID other = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        rootId = UUID.randomUUID();
        jdbc.update("insert into media_roots (id, path, label) values (?, ?, 'dl')", rootId, DOWNLOADS.toString());
        media = UUID.randomUUID();
        jdbc.update("""
            insert into media_items (id, root_id, relative_path, size_bytes, file_mtime, fingerprint, last_seen_at)
            values (?, ?, 'a.mp4', 1, now(), 'f', now())""", media, rootId);
        jdbc.update("insert into media_metadata (media_id, title) values (?, 'A')", media);
        for (UUID[] pair : new UUID[][] { { account, lea }, { account, tom }, { otherAccount, other } }) {
            jdbc.update("insert into favourites (account_id, profile_id, media_id) values (?, ?, ?)", pair[0], pair[1], media);
            jdbc.update("insert into progress (account_id, profile_id, media_id, position_seconds, duration_seconds, state) "
                + "values (?, ?, ?, 10, 100, 'STARTED')", pair[0], pair[1], media);
        }
    }

    @AfterEach
    void clean() throws IOException {
        jdbc.update("delete from favourites");
        jdbc.update("delete from progress");
        jdbc.update("delete from media_items");
        jdbc.update("delete from media_roots");
        try (var files = Files.walk(DOWNLOADS)) {
            for (Path p : files.sorted(java.util.Comparator.reverseOrder()).toList()) {
                if (!p.equals(DOWNLOADS)) {
                    Files.deleteIfExists(p);
                }
            }
        }
    }

    private ResultActions call(String url, String json, String key) throws Exception {
        var request = post(url).contentType(MediaType.APPLICATION_JSON).content(json);
        if (key != null) {
            request.header("X-Internal-Key", key);
        }
        return mvc.perform(request);
    }

    private ResultActions call(String url, String json) throws Exception {
        return call(url, json, KEY);
    }

    private int count(String table, String column, UUID id) {
        return jdbc.queryForObject("select count(*) from " + table + " where " + column + " = ?", Integer.class, id);
    }

    @Test
    void withoutOrWithAWrongKeyEveryRouteAnswers401() throws Exception {
        String purge = "{\"scope\":\"PROFILE\",\"profileId\":\"" + lea + "\"}";
        for (String url : new String[] { "/internal/purge", "/internal/downloads", "/internal/downloads/completed",
                "/internal/downloads/failed",
                "/internal/media/present", "/internal/reindex" }) {
            call(url, purge, null).andExpect(status().isUnauthorized());
            call(url, purge, "mauvaise-cle").andExpect(status().isUnauthorized());
            call(url, purge, KEY + "x").andExpect(status().isUnauthorized());
            call(url, purge, "").andExpect(status().isUnauthorized());
        }
        assertThat(count("favourites", "profile_id", lea)).isEqualTo(1);
    }

    @Test
    void aUserJwtIsNotEnoughForInternalRoutes() throws Exception {
        mvc.perform(post("/internal/purge").contentType(MediaType.APPLICATION_JSON)
                .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user("admin").roles("ADMIN"))
                .content("{\"scope\":\"PROFILE\",\"profileId\":\"" + lea + "\"}"))
            .andExpect(status().isForbidden());
    }

    @Test
    void theInternalKeyDoesNotOpenPublicApiRoutes() throws Exception {
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/media")
                .header("X-Internal-Key", KEY))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void purgingAProfileRemovesOnlyItsFavouritesAndProgress() throws Exception {
        call("/internal/purge", "{\"scope\":\"PROFILE\",\"profileId\":\"" + lea + "\"}").andExpect(status().isNoContent());
        assertThat(count("favourites", "profile_id", lea)).isZero();
        assertThat(count("progress", "profile_id", lea)).isZero();
        assertThat(count("favourites", "profile_id", tom)).isEqualTo(1);
        assertThat(count("progress", "profile_id", other)).isEqualTo(1);
        assertThat(count("media_items", "id", media)).isEqualTo(1);
        // Idempotent.
        call("/internal/purge", "{\"scope\":\"PROFILE\",\"profileId\":\"" + lea + "\"}").andExpect(status().isNoContent());
    }

    @Test
    void purgingAnAccountRemovesAllItsProfilesData() throws Exception {
        call("/internal/purge", "{\"scope\":\"ACCOUNT\",\"accountId\":\"" + account + "\"}").andExpect(status().isNoContent());
        assertThat(count("favourites", "account_id", account)).isZero();
        assertThat(count("progress", "account_id", account)).isZero();
        assertThat(count("favourites", "account_id", otherAccount)).isEqualTo(1);
    }

    @Test
    void purgeValidatesItsBody() throws Exception {
        call("/internal/purge", "{\"scope\":\"PROFILE\"}").andExpect(status().isBadRequest());
        call("/internal/purge", "{\"scope\":\"ACCOUNT\",\"profileId\":\"" + lea + "\"}").andExpect(status().isBadRequest());
        call("/internal/purge", "{\"scope\":\"TOUT\"}").andExpect(status().isBadRequest());
        call("/internal/purge", "{}").andExpect(status().isBadRequest());
        assertThat(count("favourites", "profile_id", lea)).isEqualTo(1);
    }

    @Test
    void markingDownloadingCreatesAVisibleEntryAndIsIdempotent() throws Exception {
        String body = "{\"relativePath\":\"complete/film.mp4\",\"title\":\"Film libre\"}";
        String first = call("/internal/downloads", body).andExpect(status().isOk())
            .andExpect(jsonPath("$.mediaId").exists()).andReturn().getResponse().getContentAsString();
        String second = call("/internal/downloads", body).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(second).isEqualTo(first);
        assertThat(jdbc.queryForObject("select availability from media_items where relative_path = 'complete/film.mp4'", String.class))
            .isEqualTo("DOWNLOADING");
        assertThat(jdbc.queryForObject("select title from media_metadata m join media_items i on i.id = m.media_id "
            + "where i.relative_path = 'complete/film.mp4'", String.class)).isEqualTo("Film libre");
    }

    @Test
    void completedFileBecomesAvailableAfterDownloading() throws Exception {
        Files.createDirectories(DOWNLOADS.resolve("complete"));
        Files.writeString(DOWNLOADS.resolve("complete/film.mp4"), "video");
        call("/internal/downloads", "{\"relativePath\":\"complete/film.mp4\"}").andExpect(status().isOk());
        call("/internal/downloads/completed", "{\"relativePath\":\"complete/film.mp4\"}")
            .andExpect(status().isOk()).andExpect(jsonPath("$.mediaId").exists());
        assertThat(jdbc.queryForObject("select availability from media_items where relative_path = 'complete/film.mp4'", String.class))
            .isEqualTo("AVAILABLE");
        assertThat(jdbc.queryForObject("select size_bytes from media_items where relative_path = 'complete/film.mp4'", Long.class))
            .isEqualTo(5L);
        assertThat(jdbc.queryForObject("select count(*) from media_items where relative_path = 'complete/film.mp4'", Integer.class))
            .isEqualTo(1);
    }

    @Test
    void aFailedDownloadRemovesItsEntryButNeverAnAvailableOne() throws Exception {
        Files.writeString(DOWNLOADS.resolve("pret.mp4"), "video");
        call("/internal/downloads/completed", "{\"relativePath\":\"pret.mp4\"}").andExpect(status().isOk());
        call("/internal/downloads", "{\"relativePath\":\"encours.mp4\"}").andExpect(status().isOk());

        call("/internal/downloads/failed", "{\"relativePath\":\"encours.mp4\"}").andExpect(status().isNoContent());
        call("/internal/downloads/failed", "{\"relativePath\":\"encours.mp4\"}").andExpect(status().isNoContent());
        call("/internal/downloads/failed", "{\"relativePath\":\"pret.mp4\"}").andExpect(status().isNoContent());

        assertThat(jdbc.queryForObject("select count(*) from media_items where relative_path = 'encours.mp4'", Integer.class))
            .isZero();
        assertThat(jdbc.queryForObject("select availability from media_items where relative_path = 'pret.mp4'", String.class))
            .isEqualTo("AVAILABLE");
    }

    @Test
    void presentListsOnlyAvailableMedia() throws Exception {
        Files.writeString(DOWNLOADS.resolve("pret.mp4"), "video");
        call("/internal/downloads/completed", "{\"relativePath\":\"pret.mp4\"}").andExpect(status().isOk());
        call("/internal/downloads", "{\"relativePath\":\"encours.mp4\"}").andExpect(status().isOk());
        String ready = jdbc.queryForObject("select id::text from media_items where relative_path = 'pret.mp4'", String.class);
        String pending = jdbc.queryForObject("select id::text from media_items where relative_path = 'encours.mp4'", String.class);

        call("/internal/media/present", "{\"mediaIds\":[\"" + ready + "\",\"" + pending + "\",\"" + UUID.randomUUID() + "\"]}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.mediaIds.length()").value(1))
            .andExpect(jsonPath("$.mediaIds[0]").value(ready));
    }

    @Test
    void completedRegistersAFileThatWasNeverMarkedDownloading() throws Exception {
        Files.writeString(DOWNLOADS.resolve("direct.mkv"), "video");
        call("/internal/downloads/completed", "{\"relativePath\":\"direct.mkv\"}").andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select availability from media_items where relative_path = 'direct.mkv'", String.class))
            .isEqualTo("AVAILABLE");
    }

    @Test
    void downloadingAgainARemovedFilmRestoresItsEntry() throws Exception {
        Files.writeString(DOWNLOADS.resolve("retire.mp4"), "video");
        call("/internal/downloads/completed", "{\"relativePath\":\"retire.mp4\"}").andExpect(status().isOk());
        String id = jdbc.queryForObject("select id::text from media_items where relative_path = 'retire.mp4'", String.class);
        jdbc.update("update media_metadata set title = 'Titre corrigé' where media_id = ?::uuid", id);
        jdbc.update("update media_items set deleted = true where id = ?::uuid", id);

        // Tant que le nouveau téléchargement n'est pas terminé, l'entrée reste retirée, même après un échec.
        call("/internal/downloads", "{\"relativePath\":\"retire.mp4\"}").andExpect(status().isConflict());
        call("/internal/downloads/failed", "{\"relativePath\":\"retire.mp4\"}").andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select deleted from media_items where id = ?::uuid", Boolean.class, id)).isTrue();

        call("/internal/downloads/completed", "{\"relativePath\":\"retire.mp4\"}")
            .andExpect(status().isOk()).andExpect(jsonPath("$.mediaId").value(id));
        assertThat(jdbc.queryForObject("select deleted from media_items where id = ?::uuid", Boolean.class, id)).isFalse();
        call("/internal/media/present", "{\"mediaIds\":[\"" + id + "\"]}")
            .andExpect(jsonPath("$.mediaIds[0]").value(id));
        assertThat(jdbc.queryForObject("select title from media_metadata where media_id = ?::uuid", String.class, id))
            .isEqualTo("Titre corrigé");
    }

    @Test
    void completedRefusesMissingFilesNonVideosAndTraversal() throws Exception {
        Files.writeString(DOWNLOADS.resolve("notes.txt"), "texte");
        call("/internal/downloads/completed", "{\"relativePath\":\"absent.mp4\"}")
            .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("MEDIA_FILE_MISSING"));
        call("/internal/downloads/completed", "{\"relativePath\":\"notes.txt\"}").andExpect(status().isNotFound());
        call("/internal/downloads/completed", "{\"relativePath\":\"../etc/passwd\"}").andExpect(status().isBadRequest());
        call("/internal/downloads/completed", "{\"relativePath\":\"/etc/passwd\"}").andExpect(status().isBadRequest());
        call("/internal/downloads", "{\"relativePath\":\"a/../../x.mp4\"}").andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("select count(*) from media_items", Integer.class)).isEqualTo(1);
    }

    @Test
    void aSymlinkLeavingTheDownloadsFolderIsRefused() throws Exception {
        Path outside = Files.createTempFile("homeflix-outside-", ".mp4");
        try {
            Files.createSymbolicLink(DOWNLOADS.resolve("lien.mp4"), outside);
            call("/internal/downloads/completed", "{\"relativePath\":\"lien.mp4\"}").andExpect(status().isNotFound());
        } finally {
            Files.deleteIfExists(outside);
        }
    }

    @Test
    void withoutADeclaredDownloadsFolderTheAnswerIs409() throws Exception {
        jdbc.update("update media_roots set removed = true");
        call("/internal/downloads", "{\"relativePath\":\"film.mp4\"}").andExpect(status().isConflict());
    }

    @Test
    void reindexIsAcceptedAndIdempotentWhileRunning() throws Exception {
        call("/internal/reindex", "{}").andExpect(status().isAccepted());
        call("/internal/reindex", "{}").andExpect(status().isAccepted());
    }
}
