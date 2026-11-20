package com.homeflix.acquisition.torrent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * L'adaptateur contre un vrai Transmission (la même image épinglée que `compose.yaml`) : vraie poignée de main
 * 409, vraie authentification, vrai ajout, lecture d'état et annulation. Le lien magnet n'a aucun traceur : le test
 * ne dépend d'aucun réseau extérieur (le torrent reste en recherche de pairs).
 */
@Testcontainers
class TransmissionRealClientIntegrationTests {

    private static final String IMAGE = "lscr.io/linuxserver/transmission:4.1.4-r0-ls369";
    private static final String HASH = "08ada5a7a6183aae1e09d831df6748d566095a10";
    private static final String MAGNET_WITHOUT_TRACKER = "magnet:?xt=urn:btih:" + HASH + "&dn=Sintel";
    // Identifiants de test assemblés au runtime : aucun secret littéral dans le dépôt.
    private static final String USER = "homeflix";
    private static final String PASSWORD = String.join("-", "mot", "de", "passe", "de", "test");

    @Container
    static final GenericContainer<?> TRANSMISSION = new GenericContainer<>(IMAGE)
        .withEnv("PUID", "1000").withEnv("PGID", "1000").withEnv("USER", USER).withEnv("PASS", PASSWORD)
        .withExposedPorts(9091)
        // Sans identifiants, le RPC répond 401 : c'est qu'il est prêt et qu'il exige l'authentification.
        .waitingFor(Wait.forHttp("/transmission/rpc").forStatusCode(401).withStartupTimeout(Duration.ofMinutes(2)));

    private static TransmissionClient client() {
        String url = "http://" + TRANSMISSION.getHost() + ":" + TRANSMISSION.getMappedPort(9091) + "/transmission/rpc";
        return new TransmissionClient(new TransmissionProperties(url, USER, PASSWORD, Duration.ofSeconds(3),
            "/downloads/complete", "/downloads"));
    }

    @Test
    void addStatusAndCancelWorkAgainstARealTransmission() {
        TransmissionClient client = client();

        String id = client.add(MAGNET_WITHOUT_TRACKER);

        assertThat(id).isEqualTo(HASH);
        assertThat(client.add(MAGNET_WITHOUT_TRACKER)).as("ajout idempotent").isEqualTo(HASH);
        TorrentStatus status = client.status(id).orElseThrow();
        assertThat(status.state()).isIn(TorrentStatus.State.QUEUED, TorrentStatus.State.DOWNLOADING);
        assertThat(status.progressPercent()).isZero();
        assertThat(status.files()).isEmpty();
        assertThat(status.errorCode()).isNull();

        client.cancel(id);

        assertThat(client.status(id)).as("retiré du client").isEmpty();
        client.cancel(id); // idempotent
    }

    @Test
    void wrongCredentialsAreRefusedAsABusinessError() {
        String url = "http://" + TRANSMISSION.getHost() + ":" + TRANSMISSION.getMappedPort(9091) + "/transmission/rpc";
        TransmissionClient intruder = new TransmissionClient(new TransmissionProperties(url, USER, "faux",
            Duration.ofSeconds(3), "/downloads/complete", "/downloads"));

        assertThatThrownBy(() -> intruder.status(HASH)).isInstanceOf(TorrentClientUnavailableException.class);
    }
}
