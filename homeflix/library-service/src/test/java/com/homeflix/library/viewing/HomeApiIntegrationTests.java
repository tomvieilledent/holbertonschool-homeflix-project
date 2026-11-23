package com.homeflix.library.viewing;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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

/** GET /home et GET /me/continue-watching avec un jeu de données (PostgreSQL réel). */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class HomeApiIntegrationTests {

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
    UUID alien;
    UUID gone;
    UUID missing;

    private RequestPostProcessor as(UUID profile) {
        return jwt().jwt(j -> {
            j.subject(account.toString()).claim("roles", List.of("USER"));
            if (profile != null) {
                j.claim("pid", profile.toString());
            }
        });
    }

    private UUID add(String path, String title, String genres, String availability, boolean deleted, int minutesAgo) {
        UUID rootId = jdbc.queryForObject("select id from media_roots limit 1", UUID.class);
        UUID id = UUID.randomUUID();
        jdbc.update("""
            insert into media_items (id, root_id, relative_path, size_bytes, file_mtime, fingerprint, last_seen_at, deleted,
                availability, added_at)
            values (?, ?, ?, 1, now(), 'f', now(), ?, ?, now() - make_interval(mins => ?))""",
            id, rootId, path, deleted, availability, minutesAgo);
        jdbc.update("insert into media_metadata (media_id, title, genres) values (?, ?, string_to_array(?, ','))", id, title, genres);
        return id;
    }

    private void progress(UUID profile, UUID media, String state, int position, int minutesAgo) {
        jdbc.update("""
            insert into progress (account_id, profile_id, media_id, position_seconds, duration_seconds, state, updated_at)
            values (?, ?, ?, ?, 3600, ?, now() - make_interval(mins => ?))""", account, profile, media, position, state, minutesAgo);
    }

    @BeforeEach
    void setUp() {
        jdbc.update("insert into media_roots (id, path, label) values (?, '/media', 'test')", UUID.randomUUID());
        matrix = add("matrix.mp4", "The Matrix", "Science-fiction,Action", "AVAILABLE", false, 30);
        bunny = add("bunny.mp4", "Big Buck Bunny", "Animation", "AVAILABLE", false, 20);
        alien = add("alien.mp4", "Alien", "Science-fiction", "AVAILABLE", false, 10);
        gone = add("retire.mp4", "Retiré", "Horreur", "AVAILABLE", true, 5);
        missing = add("absent.mp4", "Absent", "Western", "UNAVAILABLE", false, 5);
    }

    @AfterEach
    void clean() {
        jdbc.update("delete from favourites");
        jdbc.update("delete from progress");
        jdbc.update("delete from media_items");
        jdbc.update("delete from media_roots");
    }

    @Test
    void theFourSectionsAreAlwaysPresentEvenWithoutAnyData() throws Exception {
        jdbc.update("delete from media_items");
        mvc.perform(get("/api/v1/home").with(as(lea)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.continueWatching", empty()))
            .andExpect(jsonPath("$.recentlyAdded", empty()))
            .andExpect(jsonPath("$.categories", empty()))
            .andExpect(jsonPath("$.favourites", empty()));
        mvc.perform(get("/api/v1/me/continue-watching").with(as(lea)))
            .andExpect(status().isOk()).andExpect(jsonPath("$", empty()));
    }

    @Test
    void recentlyAddedListsAvailableMediaNewestFirstWithoutRemovedOrMissingOnes() throws Exception {
        mvc.perform(get("/api/v1/home").with(as(lea)))
            .andExpect(jsonPath("$.recentlyAdded[*].title", contains("Alien", "Big Buck Bunny", "The Matrix")));
    }

    @Test
    void categoriesOnlyHoldGenresWithAnAvailableMedia() throws Exception {
        mvc.perform(get("/api/v1/home").with(as(lea)))
            .andExpect(jsonPath("$.categories[*].genre", contains("Action", "Animation", "Science-fiction")))
            .andExpect(jsonPath("$.categories[2].items[*].title", contains("Alien", "The Matrix")));
    }

    @Test
    void continueWatchingKeepsStartedTitlesOnlyLatestFirst() throws Exception {
        progress(lea, matrix, "STARTED", 600, 50);
        progress(lea, bunny, "STARTED", 120, 5);
        progress(lea, alien, "COMPLETED", 3600, 1);
        progress(lea, gone, "STARTED", 10, 1);   // média retiré : absent
        mvc.perform(get("/api/v1/me/continue-watching").with(as(lea)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(2)))
            .andExpect(jsonPath("$[0].media.title").value("Big Buck Bunny"))
            .andExpect(jsonPath("$[0].progress.mediaId").value(bunny.toString()))
            .andExpect(jsonPath("$[0].progress.positionSeconds").value(120))
            .andExpect(jsonPath("$[0].progress.state").value("STARTED"))
            .andExpect(jsonPath("$[1].media.title").value("The Matrix"));
        mvc.perform(get("/api/v1/home").with(as(lea)))
            .andExpect(jsonPath("$.continueWatching[*].media.title", contains("Big Buck Bunny", "The Matrix")));
    }

    @Test
    void personalSectionsDependOnlyOnTheProfileOfTheToken() throws Exception {
        progress(lea, matrix, "STARTED", 600, 5);
        jdbc.update("insert into favourites (account_id, profile_id, media_id, added_at) values (?, ?, ?, now())", account, lea, bunny);
        mvc.perform(get("/api/v1/home").with(as(lea)))
            .andExpect(jsonPath("$.continueWatching", hasSize(1)))
            .andExpect(jsonPath("$.favourites[*].title", contains("Big Buck Bunny")));
        // Même compte, autre profil : rien de ce que Léa a fait.
        mvc.perform(get("/api/v1/home").with(as(tom)))
            .andExpect(jsonPath("$.continueWatching", empty()))
            .andExpect(jsonPath("$.favourites", empty()))
            .andExpect(jsonPath("$.recentlyAdded", hasSize(3)));
        mvc.perform(get("/api/v1/me/continue-watching").with(as(tom))).andExpect(jsonPath("$", empty()));
    }

    @Test
    void withoutASelectedProfileTheAnswerIs409() throws Exception {
        mvc.perform(get("/api/v1/home").with(as(null)))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PROFILE_NOT_SELECTED"));
        mvc.perform(get("/api/v1/me/continue-watching").with(as(null)))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PROFILE_NOT_SELECTED"));
    }

    @Test
    void anonymousGets401() throws Exception {
        mvc.perform(get("/api/v1/home")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/me/continue-watching")).andExpect(status().isUnauthorized());
    }
}
