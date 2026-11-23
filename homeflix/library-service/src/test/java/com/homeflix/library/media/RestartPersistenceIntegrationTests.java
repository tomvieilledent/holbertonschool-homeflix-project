package com.homeflix.library.media;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.homeflix.library.LibraryServiceApplication;

/**
 * Persistance (issue #98) : le service est arrêté puis redémarré sur la MÊME base. Les données survivent et les
 * migrations ne sont pas rejouées. Chaque démarrage est un contexte Spring complet, comme un redémarrage de conteneur.
 */
@Testcontainers
class RestartPersistenceIntegrationTests {

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    private static ConfigurableApplicationContext start() {
        return new SpringApplicationBuilder(LibraryServiceApplication.class)
            .web(WebApplicationType.SERVLET)
            .run("--server.port=0",
                "--spring.datasource.url=" + POSTGRES.getJdbcUrl(),
                "--spring.datasource.username=" + POSTGRES.getUsername(),
                "--spring.datasource.password=" + POSTGRES.getPassword(),
                "--identity.jwks-uri=http://identity-service:8081/.well-known/jwks.json");
    }

    @Test
    void dataAndMigrationsSurviveARestartOnTheSameDatabase() {
        UUID rootId = UUID.randomUUID();
        UUID mediaId = UUID.randomUUID();
        UUID profileId = UUID.randomUUID();
        int migrations;
        try (ConfigurableApplicationContext first = start()) {
            JdbcTemplate jdbc = first.getBean(JdbcTemplate.class);
            migrations = jdbc.queryForObject("select count(*) from flyway_schema_history", Integer.class);
            jdbc.update("insert into media_roots (id, path, label) values (?, '/media', 'test')", rootId);
            jdbc.update("""
                insert into media_items (id, root_id, relative_path, size_bytes, file_mtime, fingerprint, last_seen_at, deleted)
                values (?, ?, 'film.mp4', 1, now(), 'f', now(), false)""", mediaId, rootId);
            jdbc.update("insert into media_metadata (media_id, title) values (?, 'Film')", mediaId);
            jdbc.update("insert into favourites (account_id, profile_id, media_id, added_at) values (?, ?, ?, now())",
                UUID.randomUUID(), profileId, mediaId);
            jdbc.update("""
                insert into progress (account_id, profile_id, media_id, position_seconds, duration_seconds, state)
                values (?, ?, ?, 42, 100, 'STARTED')""", UUID.randomUUID(), profileId, mediaId);
        }
        assertThat(migrations).isPositive();

        try (ConfigurableApplicationContext second = start()) {
            JdbcTemplate jdbc = second.getBean(JdbcTemplate.class);
            assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history", Integer.class)).isEqualTo(migrations);
            assertThat(jdbc.queryForObject("select count(*) from media_items where id = ?", Integer.class, mediaId)).isEqualTo(1);
            assertThat(jdbc.queryForObject("select title from media_metadata where media_id = ?", String.class, mediaId)).isEqualTo("Film");
            assertThat(jdbc.queryForObject("select count(*) from favourites where profile_id = ?", Integer.class, profileId)).isEqualTo(1);
            assertThat(jdbc.queryForObject("select position_seconds from progress where profile_id = ?", Integer.class, profileId)).isEqualTo(42);
        }
    }
}
