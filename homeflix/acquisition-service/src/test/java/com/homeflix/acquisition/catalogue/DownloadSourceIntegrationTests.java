package com.homeflix.acquisition.catalogue;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.homeflix.acquisition.api.ApiException;

/**
 * Un téléchargement ne part que d'un identifiant du catalogue autorisé : le magnet est lu en base et revalidé.
 * (L'absence de licence ou de preuve est déjà refusée par la base : voir CataloguePersistenceIntegrationTests.)
 */
@SpringBootTest
@Testcontainers
class DownloadSourceIntegrationTests {

    static final UUID SINTEL_ID = UUID.fromString("7d1c0a52-3f6e-4b8a-9c21-0f4a6e2b1d11");

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired CatalogueService catalogue;
    @Autowired JdbcTemplate jdbc;

    @AfterEach
    void clean() {
        jdbc.update("delete from catalogue_entries where id <> ?", SINTEL_ID);
    }

    private UUID insert(String magnet, String infohash) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
            insert into catalogue_entries (id, title, source, license, license_proof_url, magnet_uri, infohash, size_bytes)
            values (?, 'Test', 'Source', 'CC BY 3.0', 'https://example.org/licence', ?, ?, 1000)""", id, magnet, infohash);
        return id;
    }

    @Test
    void theSeededEntryYieldsItsServerSideSource() {
        DownloadSource source = catalogue.sourceFor(SINTEL_ID);
        assertThat(source.infohash()).isEqualTo("08ada5a7a6183aae1e09d831df6748d566095a10");
        assertThat(source.magnetUri()).startsWith("magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10");
    }

    @Test
    void anUnknownIdentifierIs404() {
        assertThatThrownBy(() -> catalogue.sourceFor(UUID.randomUUID()))
            .isInstanceOfSatisfying(ApiException.class, e -> {
                assertThat(e.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
                assertThat(e.getCode()).isEqualTo("NOT_FOUND");
            });
    }

    @Test
    void aMagnetWhoseHashDiffersFromTheStoredInfohashIsRefused() {
        UUID id = insert("magnet:?xt=urn:btih:" + "1".repeat(40), "2".repeat(40));
        assertThatThrownBy(() -> catalogue.sourceFor(id)).isInstanceOfSatisfying(ApiException.class,
            e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.CONFLICT));
        assertThat(catalogue.countInvalidSources()).isEqualTo(1);
    }

    @Test
    void aMagnetCarryingAnUrlAfterTheHashIsStillATrackerParameterNotASecondSource() {
        // « xt » est unique et en tête : un second paramètre ne change pas ce qui est téléchargé.
        UUID id = insert("magnet:?xt=urn:btih:" + "3".repeat(40) + "&dn=x&tr=http%3A%2F%2F127.0.0.1%2F", "3".repeat(40));
        assertThat(catalogue.sourceFor(id).infohash()).isEqualTo("3".repeat(40));
    }

    @Test
    void aBase32MagnetMatchesItsHexInfohash() {
        UUID id = insert("magnet:?xt=urn:btih:" + "A".repeat(32), "0".repeat(40));
        assertThat(catalogue.sourceFor(id).infohash()).isEqualTo("0".repeat(40));
        assertThat(catalogue.countInvalidSources()).isZero();
    }
}
