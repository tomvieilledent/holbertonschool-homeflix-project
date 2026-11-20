package com.homeflix.library.viewing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
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

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class FavouriteApiIntegrationTests {

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

    final UUID account = UUID.randomUUID();
    final UUID lea = UUID.randomUUID();
    final UUID tom = UUID.randomUUID();
    UUID matrix;
    UUID bunny;
    UUID removed;

    private RequestPostProcessor as(UUID profile) {
        return jwt().jwt(j -> {
            j.subject(account.toString()).claim("roles", List.of("USER"));
            if (profile != null) {
                j.claim("pid", profile.toString());
            }
        });
    }

    private UUID add(String path, String title, boolean deleted) {
        UUID rootId = jdbc.queryForObject("select id from media_roots limit 1", UUID.class);
        UUID id = UUID.randomUUID();
        jdbc.update("""
            insert into media_items (id, root_id, relative_path, size_bytes, file_mtime, fingerprint, last_seen_at, deleted)
            values (?, ?, ?, 1, now(), 'f', now(), ?)""", id, rootId, path, deleted);
        jdbc.update("insert into media_metadata (media_id, title) values (?, ?)", id, title);
        return id;
    }

    @BeforeEach
    void setUp() {
        jdbc.update("insert into media_roots (id, path, label) values (?, '/media', 'test')", UUID.randomUUID());
        matrix = add("matrix.mp4", "The Matrix", false);
        bunny = add("bunny.mp4", "Big Buck Bunny", false);
        removed = add("retire.mp4", "Retiré", true);
    }

    @AfterEach
    void clean() {
        jdbc.update("delete from favourites");
        jdbc.update("delete from media_items");
        jdbc.update("delete from media_roots");
    }

    private int count(UUID profile) {
        return jdbc.queryForObject("select count(*) from favourites where profile_id = ?", Integer.class, profile);
    }

    @Test
    void addingTwiceKeepsASingleFavourite() throws Exception {
        mvc.perform(put("/api/v1/me/favourites/" + matrix).with(as(lea))).andExpect(status().isNoContent());
        mvc.perform(put("/api/v1/me/favourites/" + matrix).with(as(lea))).andExpect(status().isNoContent());
        assertThat(count(lea)).isEqualTo(1);
    }

    @Test
    void removingIsIdempotent() throws Exception {
        mvc.perform(put("/api/v1/me/favourites/" + matrix).with(as(lea))).andExpect(status().isNoContent());
        mvc.perform(delete("/api/v1/me/favourites/" + matrix).with(as(lea))).andExpect(status().isNoContent());
        mvc.perform(delete("/api/v1/me/favourites/" + matrix).with(as(lea))).andExpect(status().isNoContent());
        assertThat(count(lea)).isZero();
    }

    @Test
    void favouritesAreIsolatedBetweenProfilesOfTheSameAccount() throws Exception {
        mvc.perform(put("/api/v1/me/favourites/" + matrix).with(as(lea))).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/me/favourites").with(as(lea)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
            .andExpect(jsonPath("$.items[0].title").value("The Matrix"));
        mvc.perform(get("/api/v1/me/favourites").with(as(tom)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
        // Retirer chez Tom ne touche pas la liste de Léa.
        mvc.perform(delete("/api/v1/me/favourites/" + matrix).with(as(tom))).andExpect(status().isNoContent());
        assertThat(count(lea)).isEqualTo(1);
    }

    @Test
    void listIsNewestFirstAndPaginated() throws Exception {
        mvc.perform(put("/api/v1/me/favourites/" + matrix).with(as(lea))).andExpect(status().isNoContent());
        jdbc.update("update favourites set added_at = now() - interval '1 day'");
        mvc.perform(put("/api/v1/me/favourites/" + bunny).with(as(lea))).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/me/favourites?size=1").with(as(lea)))
            .andExpect(jsonPath("$.items[0].title").value("Big Buck Bunny"))
            .andExpect(jsonPath("$.total").value(2)).andExpect(jsonPath("$.totalPages").value(2));
        mvc.perform(get("/api/v1/me/favourites?size=1&page=1").with(as(lea)))
            .andExpect(jsonPath("$.items[0].title").value("The Matrix"));
        mvc.perform(get("/api/v1/me/favourites?size=0").with(as(lea))).andExpect(status().isBadRequest());
    }

    @Test
    void unknownOrRemovedMediaIs404() throws Exception {
        mvc.perform(put("/api/v1/me/favourites/" + UUID.randomUUID()).with(as(lea))).andExpect(status().isNotFound());
        mvc.perform(put("/api/v1/me/favourites/" + removed).with(as(lea))).andExpect(status().isNotFound());
        assertThat(count(lea)).isZero();
    }

    @Test
    void withoutActiveProfileTheRoutesAnswer409() throws Exception {
        mvc.perform(get("/api/v1/me/favourites").with(as(null)))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PROFILE_NOT_SELECTED"));
        mvc.perform(put("/api/v1/me/favourites/" + matrix).with(as(null))).andExpect(status().isConflict());
        mvc.perform(delete("/api/v1/me/favourites/" + matrix).with(as(null))).andExpect(status().isConflict());
    }

    @Test
    void requiresAuthentication() throws Exception {
        mvc.perform(get("/api/v1/me/favourites")).andExpect(status().isUnauthorized());
    }
}
