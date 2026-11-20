package com.homeflix.library.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class AdminMediaApiIntegrationTests {

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

    Path dir;
    Path file;
    String content = "contenu-video-factice";
    UUID media;

    private static RequestPostProcessor admin() {
        return user("admin").roles("ADMIN");
    }

    @BeforeEach
    void setUp() throws IOException {
        dir = Files.createTempDirectory("homeflix-admin-media-");
        file = dir.resolve("film.mp4");
        Files.writeString(file, content);
        UUID root = UUID.randomUUID();
        jdbc.update("insert into media_roots (id, path, label) values (?, ?, 'test')", root, dir.toString());
        media = UUID.randomUUID();
        jdbc.update("""
            insert into media_items (id, root_id, relative_path, size_bytes, file_mtime, fingerprint, last_seen_at)
            values (?, ?, 'film.mp4', ?, now(), 'f', now())""", media, root, content.length());
        jdbc.update("insert into media_metadata (media_id, title, genres, year) values (?, 'film', '{Action}', 1999)", media);
    }

    @AfterEach
    void clean() throws IOException {
        jdbc.update("delete from favourites");
        jdbc.update("delete from media_items");
        jdbc.update("delete from media_roots");
        Files.deleteIfExists(file);
        Files.deleteIfExists(dir);
    }

    private ResultActions patchMedia(UUID id, String body) throws Exception {
        return mvc.perform(patch("/api/v1/admin/media/" + id).with(admin())
            .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void adminCorrectsMetadataAndTheCatalogueShowsIt() throws Exception {
        patchMedia(media, "{\"title\":\"Big Buck Bunny\",\"description\":\"Un lapin.\",\"genres\":[\"Animation\",\"Comédie\"],\"year\":2008}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.title").value("Big Buck Bunny"))
            .andExpect(jsonPath("$.year").value(2008))
            .andExpect(jsonPath("$.genres.length()").value(2));
        mvc.perform(get("/api/v1/media/" + media).with(user("u").roles("USER")))
            .andExpect(jsonPath("$.title").value("Big Buck Bunny")).andExpect(jsonPath("$.description").value("Un lapin."));
        assertThat(jdbc.queryForObject("select edited from media_metadata where media_id = ?", Boolean.class, media)).isTrue();
    }

    @Test
    void partialUpdateKeepsOtherFields() throws Exception {
        patchMedia(media, "{\"year\":2001}").andExpect(status().isOk())
            .andExpect(jsonPath("$.title").value("film")).andExpect(jsonPath("$.year").value(2001));
    }

    @Test
    void inputIsSanitisedAndValidated() throws Exception {
        patchMedia(media, "{\"title\":\"  Ti\\u0000tre\\u0007  \",\"genres\":[\"Action\",\"Action\",\" Drame \"]}")
            .andExpect(status().isOk()).andExpect(jsonPath("$.title").value("Titre"))
            .andExpect(jsonPath("$.genres.length()").value(2)).andExpect(jsonPath("$.genres[1]").value("Drame"));
        patchMedia(media, "{\"title\":\"   \"}").andExpect(status().isBadRequest());
        patchMedia(media, "{\"title\":\"" + "x".repeat(201) + "\"}").andExpect(status().isBadRequest());
        patchMedia(media, "{\"year\":1800}").andExpect(status().isBadRequest());
        patchMedia(media, "{\"genres\":[\"\"]}").andExpect(status().isBadRequest());
        patchMedia(media, "{\"genres\":[\"1\",\"2\",\"3\",\"4\",\"5\",\"6\",\"7\",\"8\",\"9\",\"10\",\"11\"]}")
            .andExpect(status().isBadRequest());
        patchMedia(media, "{}").andExpect(status().isBadRequest());
    }

    @Test
    void emptyDescriptionClearsIt() throws Exception {
        patchMedia(media, "{\"description\":\"Texte\"}").andExpect(status().isOk());
        patchMedia(media, "{\"description\":\"\"}").andExpect(status().isOk()).andExpect(jsonPath("$.description").doesNotExist());
    }

    @Test
    void deletingRemovesTheEntryButLeavesTheSourceFileUntouched() throws Exception {
        long size = Files.size(file);
        var mtime = Files.getLastModifiedTime(file);
        mvc.perform(delete("/api/v1/admin/media/" + media).with(admin())).andExpect(status().isNoContent());

        assertThat(file).exists().hasContent(content);
        assertThat(Files.size(file)).isEqualTo(size);
        assertThat(Files.getLastModifiedTime(file)).isEqualTo(mtime);
        assertThat(dir.toFile().list()).containsExactly("film.mp4");
        // Ligne conservée (suppression douce) : une réindexation ne la recrée pas.
        assertThat(jdbc.queryForObject("select deleted from media_items where id = ?", Boolean.class, media)).isTrue();
        mvc.perform(get("/api/v1/media/" + media).with(user("u").roles("USER"))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/media").with(user("u").roles("USER"))).andExpect(jsonPath("$.total").value(0));
    }

    @Test
    void deletingTwiceOrEditingARemovedEntryIs404() throws Exception {
        mvc.perform(delete("/api/v1/admin/media/" + media).with(admin())).andExpect(status().isNoContent());
        mvc.perform(delete("/api/v1/admin/media/" + media).with(admin())).andExpect(status().isNotFound());
        patchMedia(media, "{\"title\":\"x\"}").andExpect(status().isNotFound());
        patchMedia(UUID.randomUUID(), "{\"title\":\"x\"}").andExpect(status().isNotFound());
    }

    @Test
    void aUserGets403AndAnonymousGets401() throws Exception {
        mvc.perform(patch("/api/v1/admin/media/" + media).with(user("u").roles("USER"))
            .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"x\"}")).andExpect(status().isForbidden());
        mvc.perform(delete("/api/v1/admin/media/" + media).with(user("u").roles("USER"))).andExpect(status().isForbidden());
        mvc.perform(delete("/api/v1/admin/media/" + media)).andExpect(status().isUnauthorized());
        assertThat(jdbc.queryForObject("select deleted from media_items where id = ?", Boolean.class, media)).isFalse();
    }
}
