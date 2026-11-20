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
class ProgressApiIntegrationTests {

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
    UUID media;

    private RequestPostProcessor as(UUID profile) {
        return jwt().jwt(j -> {
            j.subject(account.toString()).claim("roles", List.of("USER"));
            if (profile != null) {
                j.claim("pid", profile.toString());
            }
        });
    }

    private ResultActions save(UUID profile, int position, int duration) throws Exception {
        return mvc.perform(put("/api/v1/media/" + media + "/progress").with(as(profile))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"positionSeconds\":" + position + ",\"durationSeconds\":" + duration + "}"));
    }

    @BeforeEach
    void setUp() {
        UUID root = UUID.randomUUID();
        jdbc.update("insert into media_roots (id, path, label) values (?, '/media', 'test')", root);
        media = UUID.randomUUID();
        jdbc.update("""
            insert into media_items (id, root_id, relative_path, size_bytes, file_mtime, fingerprint, last_seen_at)
            values (?, ?, 'a.mp4', 1, now(), 'f', now())""", media, root);
        jdbc.update("insert into media_metadata (media_id, title) values (?, 'A')", media);
    }

    @AfterEach
    void clean() {
        jdbc.update("delete from progress");
        jdbc.update("delete from media_items");
        jdbc.update("delete from media_roots");
    }

    @Test
    void withoutProgressTheStateIsNotStarted() throws Exception {
        mvc.perform(get("/api/v1/media/" + media + "/progress").with(as(lea)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.state").value("NOT_STARTED"))
            .andExpect(jsonPath("$.positionSeconds").value(0));
    }

    @Test
    void savingStoresPositionAndStartedState() throws Exception {
        save(lea, 312, 596).andExpect(status().isOk())
            .andExpect(jsonPath("$.positionSeconds").value(312)).andExpect(jsonPath("$.durationSeconds").value(596))
            .andExpect(jsonPath("$.state").value("STARTED"));
        mvc.perform(get("/api/v1/media/" + media + "/progress").with(as(lea)))
            .andExpect(jsonPath("$.positionSeconds").value(312));
    }

    @Test
    void savingIsAnIdempotentUpsert() throws Exception {
        save(lea, 100, 600).andExpect(status().isOk());
        save(lea, 100, 600).andExpect(status().isOk());
        save(lea, 200, 600).andExpect(status().isOk()).andExpect(jsonPath("$.positionSeconds").value(200));
        assertThat(jdbc.queryForObject("select count(*) from progress", Integer.class)).isEqualTo(1);
    }

    @Test
    void ninetyFivePercentIsCompletedAndJustBelowIsNot() throws Exception {
        save(lea, 569, 600).andExpect(jsonPath("$.state").value("STARTED"));
        save(lea, 570, 600).andExpect(jsonPath("$.state").value("COMPLETED"));
        save(lea, 600, 600).andExpect(jsonPath("$.state").value("COMPLETED"));
    }

    @Test
    void positionIsCappedToTheDuration() throws Exception {
        save(lea, 9999, 600).andExpect(status().isOk())
            .andExpect(jsonPath("$.positionSeconds").value(600)).andExpect(jsonPath("$.state").value("COMPLETED"));
    }

    @Test
    void positionZeroStaysNotStarted() throws Exception {
        save(lea, 0, 600).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("NOT_STARTED"));
    }

    @Test
    void invalidBodiesAreRejected() throws Exception {
        save(lea, -1, 600).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        save(lea, 10, 0).andExpect(status().isBadRequest());
        mvc.perform(put("/api/v1/media/" + media + "/progress").with(as(lea))
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void twoProfilesHaveIndependentProgress() throws Exception {
        save(lea, 300, 600).andExpect(status().isOk());
        mvc.perform(get("/api/v1/media/" + media + "/progress").with(as(tom)))
            .andExpect(jsonPath("$.state").value("NOT_STARTED")).andExpect(jsonPath("$.positionSeconds").value(0));
        save(tom, 590, 600).andExpect(jsonPath("$.state").value("COMPLETED"));
        mvc.perform(get("/api/v1/media/" + media + "/progress").with(as(lea)))
            .andExpect(jsonPath("$.state").value("STARTED")).andExpect(jsonPath("$.positionSeconds").value(300));
    }

    @Test
    void theProfileComesFromTheTokenNeverFromTheRequest() throws Exception {
        mvc.perform(put("/api/v1/media/" + media + "/progress?profileId=" + tom).with(as(lea))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"positionSeconds\":10,\"durationSeconds\":600,\"profileId\":\"" + tom + "\"}"))
            .andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select count(*) from progress where profile_id = ?", Integer.class, lea)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from progress where profile_id = ?", Integer.class, tom)).isZero();
    }

    @Test
    void deleteResetsToNotStartedAndIsIdempotent() throws Exception {
        save(lea, 300, 600).andExpect(status().isOk());
        mvc.perform(delete("/api/v1/media/" + media + "/progress").with(as(lea))).andExpect(status().isNoContent());
        mvc.perform(delete("/api/v1/media/" + media + "/progress").with(as(lea))).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/media/" + media + "/progress").with(as(lea)))
            .andExpect(jsonPath("$.state").value("NOT_STARTED"));
    }

    @Test
    void deleteOnlyAffectsTheActiveProfile() throws Exception {
        save(lea, 300, 600).andExpect(status().isOk());
        mvc.perform(delete("/api/v1/media/" + media + "/progress").with(as(tom))).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/media/" + media + "/progress").with(as(lea)))
            .andExpect(jsonPath("$.positionSeconds").value(300));
    }

    @Test
    void unknownMediaIs404AndMissingProfileIs409() throws Exception {
        mvc.perform(get("/api/v1/media/" + UUID.randomUUID() + "/progress").with(as(lea)))
            .andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/media/" + media + "/progress").with(as(null)))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PROFILE_NOT_SELECTED"));
        mvc.perform(get("/api/v1/media/" + media + "/progress")).andExpect(status().isUnauthorized());
    }
}
