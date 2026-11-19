package com.homeflix.acquisition.torrent;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

/**
 * Les variables de `compose.yaml` (`TRANSMISSION_URL`, `TRANSMISSION_USER`, `TRANSMISSION_PASS`, `DOWNLOADS_ROOT`)
 * arrivent bien dans l'adaptateur, avec des valeurs par défaut sûres.
 */
class TransmissionConfigurationTests {

    // Identifiants de test assemblés au runtime : aucun secret littéral dans le dépôt.
    private static final String PASSWORD = String.join("-", "mot", "de", "passe", "de", "test");

    private final ApplicationContextRunner runner = new ApplicationContextRunner().withUserConfiguration(TorrentConfig.class);

    @Test
    void bindsTheComposeVariablesAndDerivesTheDownloadDirectory() {
        runner.withPropertyValues(
                "acquisition.transmission.url=http://transmission:9091/transmission/rpc",
                "acquisition.transmission.user=homeflix",
                "acquisition.transmission.password=" + PASSWORD,
                "acquisition.transmission.downloads-root=/downloads")
            .run(context -> {
                TransmissionProperties properties = context.getBean(TransmissionProperties.class);

                assertThat(properties.url()).isEqualTo("http://transmission:9091/transmission/rpc");
                assertThat(properties.user()).isEqualTo("homeflix");
                assertThat(properties.password()).isEqualTo(PASSWORD);
                assertThat(properties.timeout()).as("délai par défaut").isEqualTo(Duration.ofSeconds(3));
                assertThat(properties.downloadDir()).as("fichiers terminés").isEqualTo("/downloads/complete");
                assertThat(context.getBean(TorrentClient.class)).isInstanceOf(TransmissionClient.class);
            });
    }

    @Test
    void theTimeoutAndTheDestinationCanBeOverriddenByTheEnvironment() {
        runner.withPropertyValues(
                "acquisition.transmission.url=http://transmission:9091/transmission/rpc",
                "acquisition.transmission.timeout=5s",
                "acquisition.transmission.downloads-root=/data",
                "acquisition.transmission.download-dir=/data/termines")
            .run(context -> {
                TransmissionProperties properties = context.getBean(TransmissionProperties.class);

                assertThat(properties.timeout()).isEqualTo(Duration.ofSeconds(5));
                assertThat(properties.downloadDir()).isEqualTo("/data/termines");
            });
    }

    @Test
    void theApplicationRefusesToStartWithADownloadDirectoryOutsideTheRoot() {
        runner.withPropertyValues(
                "acquisition.transmission.url=http://transmission:9091/transmission/rpc",
                "acquisition.transmission.downloads-root=/downloads",
                "acquisition.transmission.download-dir=/etc")
            .run(context -> assertThat(context).hasFailed());
    }
}
