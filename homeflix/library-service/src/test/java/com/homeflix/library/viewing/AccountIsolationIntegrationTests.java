package com.homeflix.library.viewing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.empty;
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
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Isolation entre DEUX COMPTES (issue #98) : un autre compte ne voit, ne modifie et ne supprime ni les favoris ni la
 * progression d'un profil qui n'est pas le sien. Le profil vient toujours du jeton, jamais de la requête.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class AccountIsolationIntegrationTests {

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

    final UUID accountA = UUID.randomUUID();
    final UUID profileA = UUID.randomUUID();
    final UUID accountB = UUID.randomUUID();
    final UUID profileB = UUID.randomUUID();
    UUID media;

    private RequestPostProcessor as(UUID account, UUID profile) {
        return jwt().jwt(j -> j.subject(account.toString()).claim("roles", List.of("USER")).claim("pid", profile.toString()));
    }

    @BeforeEach
    void setUp() {
        UUID rootId = UUID.randomUUID();
        jdbc.update("insert into media_roots (id, path, label) values (?, '/media', 'test')", rootId);
        media = UUID.randomUUID();
        jdbc.update("""
            insert into media_items (id, root_id, relative_path, size_bytes, file_mtime, fingerprint, last_seen_at, deleted)
            values (?, ?, 'film.mp4', 1, now(), 'f', now(), false)""", media, rootId);
        jdbc.update("insert into media_metadata (media_id, title) values (?, 'Film')", media);
    }

    @AfterEach
    void clean() {
        jdbc.update("delete from favourites");
        jdbc.update("delete from progress");
        jdbc.update("delete from media_items");
        jdbc.update("delete from media_roots");
    }

    private void saveProgress(UUID account, UUID profile, int position) throws Exception {
        mvc.perform(put("/api/v1/media/" + media + "/progress").with(as(account, profile))
                .contentType(MediaType.APPLICATION_JSON).content("{\"positionSeconds\":" + position + ",\"durationSeconds\":3600}"))
            .andExpect(status().isOk());
    }

    @Test
    void anotherAccountNeverSeesFavouritesOfAProfileThatIsNotItsOwn() throws Exception {
        mvc.perform(put("/api/v1/me/favourites/" + media).with(as(accountA, profileA))).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/me/favourites").with(as(accountB, profileB)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0)).andExpect(jsonPath("$.items", empty()));
    }

    @Test
    void anotherAccountCannotRemoveSomeoneElsesFavourite() throws Exception {
        mvc.perform(put("/api/v1/me/favourites/" + media).with(as(accountA, profileA))).andExpect(status().isNoContent());
        mvc.perform(delete("/api/v1/me/favourites/" + media).with(as(accountB, profileB))).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select count(*) from favourites where profile_id = ?", Integer.class, profileA)).isEqualTo(1);
    }

    @Test
    void anotherAccountNeverSeesOrChangesTheProgressOfAProfileThatIsNotItsOwn() throws Exception {
        saveProgress(accountA, profileA, 600);
        mvc.perform(get("/api/v1/media/" + media + "/progress").with(as(accountB, profileB)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.state").value("NOT_STARTED")).andExpect(jsonPath("$.positionSeconds").value(0));
        mvc.perform(delete("/api/v1/media/" + media + "/progress").with(as(accountB, profileB))).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/media/" + media + "/progress").with(as(accountA, profileA)))
            .andExpect(jsonPath("$.positionSeconds").value(600)).andExpect(jsonPath("$.state").value("STARTED"));
    }

    @Test
    void savingProgressOnlyWritesTheProfileOfTheTokenAndItsOwnAccount() throws Exception {
        saveProgress(accountA, profileA, 100);
        saveProgress(accountB, profileB, 200);
        assertThat(jdbc.queryForObject("select position_seconds from progress where profile_id = ? and account_id = ?",
            Integer.class, profileA, accountA)).isEqualTo(100);
        assertThat(jdbc.queryForObject("select position_seconds from progress where profile_id = ? and account_id = ?",
            Integer.class, profileB, accountB)).isEqualTo(200);
        assertThat(jdbc.queryForObject("select count(*) from progress", Integer.class)).isEqualTo(2);
    }

    @Test
    void aProfileIdInTheRequestIsIgnoredInFavourOfTheOneInTheToken() throws Exception {
        mvc.perform(put("/api/v1/media/" + media + "/progress?profileId=" + profileA).with(as(accountB, profileB))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"positionSeconds\":50,\"durationSeconds\":3600,\"profileId\":\"" + profileA + "\"}"));
        assertThat(jdbc.queryForObject("select count(*) from progress where profile_id = ?", Integer.class, profileA)).isZero();
    }
}
