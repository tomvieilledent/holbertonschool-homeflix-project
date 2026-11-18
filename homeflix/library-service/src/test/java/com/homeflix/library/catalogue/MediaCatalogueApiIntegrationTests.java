package com.homeflix.library.catalogue;

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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class MediaCatalogueApiIntegrationTests {

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

    UUID rootId;
    UUID matrix;
    UUID amelie;
    UUID bunny;
    UUID gone;

    private static RequestPostProcessor user() {
        return jwt().jwt(j -> j.subject(UUID.randomUUID().toString()).claim("roles", List.of("USER")));
    }

    private UUID add(String path, String title, String genres, Integer year, String availability, boolean deleted, String addedAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
            insert into media_items (id, root_id, relative_path, size_bytes, file_mtime, fingerprint, availability, last_seen_at, deleted, added_at)
            values (?, ?, ?, 1, now(), 'f', ?, now(), ?, ?::timestamptz)""", id, rootId, path, availability, deleted, addedAt);
        jdbc.update("insert into media_metadata (media_id, title, genres, year) values (?, ?, ?::text[], ?)",
            id, title, genres, year);
        return id;
    }

    @BeforeEach
    void setUp() {
        rootId = UUID.randomUUID();
        jdbc.update("insert into media_roots (id, path, label) values (?, '/media', 'test')", rootId);
        matrix = add("matrix.mp4", "The Matrix", "{Science-fiction,Action}", 1999, "AVAILABLE", false, "2026-11-10T10:00:00Z");
        amelie = add("amelie.mp4", "Amélie Poulain", "{Comédie}", 2001, "UNAVAILABLE", false, "2026-11-12T10:00:00Z");
        bunny = add("bunny.mp4", "Big Buck Bunny", "{Animation,Comédie}", 2008, "AVAILABLE", false, "2026-11-14T10:00:00Z");
        gone = add("retire.mp4", "Matrix retiré", "{Action}", 2003, "AVAILABLE", true, "2026-11-16T10:00:00Z");
    }

    @AfterEach
    void clean() {
        jdbc.update("delete from media_items");
        jdbc.update("delete from media_roots");
    }

    private ResultActions list(String query) throws Exception {
        return mvc.perform(get("/api/v1/media" + query).with(user()));
    }

    @Test
    void searchingMatrixFindsTheMatrixAndNotTheRemovedEntry() throws Exception {
        list("?q=matrix").andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(1))
            .andExpect(jsonPath("$.items[0].title").value("The Matrix"))
            .andExpect(jsonPath("$.items[0].availability").value("AVAILABLE"));
    }

    @Test
    void searchIsInsensitiveToCaseAndAccents() throws Exception {
        list("?q=AMELIE").andExpect(jsonPath("$.items[0].title").value("Amélie Poulain"));
        list("?q=amélie").andExpect(jsonPath("$.total").value(1));
        list("?q=bUnNy").andExpect(jsonPath("$.items[0].title").value("Big Buck Bunny"));
    }

    @Test
    void likeWildcardsInTheQueryAreSearchedLiterally() throws Exception {
        list("?q=%25").andExpect(jsonPath("$.total").value(0));
        list("?q=_").andExpect(jsonPath("$.total").value(0));
    }

    @Test
    void sqlInjectionAttemptsAreInertAndTheTableSurvives() throws Exception {
        list("?q=" + java.net.URLEncoder.encode("'; DROP TABLE media_items; --", java.nio.charset.StandardCharsets.UTF_8))
            .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
        list("?genre=" + java.net.URLEncoder.encode("x' OR '1'='1", java.nio.charset.StandardCharsets.UTF_8))
            .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
        list("?sort=" + java.net.URLEncoder.encode("title; DROP TABLE media_items", java.nio.charset.StandardCharsets.UTF_8))
            .andExpect(status().isBadRequest());
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from media_items", Integer.class)).isEqualTo(4);
    }

    @Test
    void genreFilterIsCaseAndAccentInsensitiveAndCombinesWithSearch() throws Exception {
        list("?genre=comedie").andExpect(jsonPath("$.total").value(2));
        list("?genre=Action").andExpect(jsonPath("$.total").value(1)); // l'entrée retirée n'apparaît jamais
        list("?genre=Comédie&q=bunny").andExpect(jsonPath("$.total").value(1));
    }

    @Test
    void unavailableMediaStaysVisibleWithItsStatusAndCanBeFiltered() throws Exception {
        list("?q=amelie").andExpect(jsonPath("$.items[0].availability").value("UNAVAILABLE"));
        list("?availability=UNAVAILABLE").andExpect(jsonPath("$.total").value(1));
        list("?availability=nimporte").andExpect(status().isBadRequest());
    }

    @Test
    void defaultSortIsNewestFirstAndOtherSortsWork() throws Exception {
        list("").andExpect(jsonPath("$.items[0].title").value("Big Buck Bunny"))
            .andExpect(jsonPath("$.items[2].title").value("The Matrix"));
        list("?sort=title,asc").andExpect(jsonPath("$.items[0].title").value("Amélie Poulain"));
        list("?sort=year,desc").andExpect(jsonPath("$.items[0].year").value(2008));
    }

    @Test
    void paginationIsCorrectAndSizeIsLimitedTo50() throws Exception {
        list("?size=2&page=0").andExpect(jsonPath("$.items.length()").value(2))
            .andExpect(jsonPath("$.total").value(3)).andExpect(jsonPath("$.totalPages").value(2));
        list("?size=2&page=1").andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.page").value(1));
        list("?size=51").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        list("?size=0").andExpect(status().isBadRequest());
        list("?page=-1").andExpect(status().isBadRequest());
        list("?q=" + "x".repeat(101)).andExpect(status().isBadRequest());
    }

    @Test
    void detailReturnsTheMediaAndNeverExposesAPathOrAnUnknownEntry() throws Exception {
        mvc.perform(get("/api/v1/media/" + matrix).with(user()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.title").value("The Matrix"))
            .andExpect(jsonPath("$.genres.length()").value(2))
            .andExpect(jsonPath("$.durationSeconds").doesNotExist())
            .andExpect(jsonPath("$.relativePath").doesNotExist())
            .andExpect(jsonPath("$.path").doesNotExist());
        mvc.perform(get("/api/v1/media/" + gone).with(user())).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/media/" + UUID.randomUUID()).with(user())).andExpect(status().isNotFound());
    }

    @Test
    void genresListsOnlyGenresOfAvailableMedia() throws Exception {
        mvc.perform(get("/api/v1/genres").with(user())).andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(4)) // Action, Animation, Comédie (Big Buck Bunny), Science-fiction
            .andExpect(jsonPath("$[0]").value("Action"));
    }

    @Test
    void anonymousCallsGet401() throws Exception {
        mvc.perform(get("/api/v1/media")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/genres")).andExpect(status().isUnauthorized());
    }
}
