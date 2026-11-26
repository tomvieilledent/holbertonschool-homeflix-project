package com.homeflix.acquisition.torrent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import com.homeflix.acquisition.api.ApiException;

/**
 * Adaptateur Transmission contre un faux démon qui rejoue la poignée de main du RPC : protocole, destination
 * imposée, refus de tout ce qui n'est pas un magnet, correspondance des états, annulation sans effacer un fichier
 * terminé, et panne du client.
 */
class TransmissionClientTests {

    private static final String HASH = "08ada5a7a6183aae1e09d831df6748d566095a10";
    private static final String MAGNET = "magnet:?xt=urn:btih:" + HASH + "&dn=Sintel&tr=udp%3A%2F%2Ftracker.example%3A1337";
    // Identifiants de test assemblés au runtime : aucun secret littéral dans le dépôt.
    private static final String USER = "homeflix";
    private static final String PASSWORD = String.join("-", "mot", "de", "passe", "de", "test");

    private FakeTransmission transmission;
    private TransmissionClient client;

    @BeforeEach
    void start() throws IOException {
        transmission = new FakeTransmission();
        client = new TransmissionClient(properties(transmission.url(), Duration.ofSeconds(2)));
    }

    @AfterEach
    void stop() {
        transmission.close();
    }

    private static TransmissionProperties properties(String url, Duration timeout) {
        return new TransmissionProperties(url, USER, PASSWORD, timeout, "/downloads/complete", "/downloads");
    }

    /** Un torrent tel que Transmission le décrit (champs demandés par l'adaptateur). */
    private static String torrent(int status, double percentDone, int error, String errorString, long totalSize,
            long leftUntilDone, double metadata, String files) {
        return "{\"torrents\":[{\"hashString\":\"" + HASH + "\",\"status\":" + status + ",\"percentDone\":" + percentDone
            + ",\"error\":" + error + ",\"errorString\":\"" + errorString + "\",\"totalSize\":" + totalSize
            + ",\"leftUntilDone\":" + leftUntilDone + ",\"metadataPercentComplete\":" + metadata + ",\"files\":" + files + "}]}";
    }

    private void serveTorrent(String torrentArguments) {
        transmission.handler = request -> request.body().contains("torrent-get")
            ? FakeTransmission.Response.ok(torrentArguments) : FakeTransmission.Response.ok("{}");
    }

    private TorrentStatus status() {
        return client.status(HASH).orElseThrow();
    }

    // --- Protocole ---------------------------------------------------------------------------------------------

    @Test
    void performsTheSessionHandshakeOnceThenReusesTheSessionId() {
        transmission.handler = request -> FakeTransmission.Response.ok("{\"torrent-added\":{\"hashString\":\"" + HASH + "\"}}");

        client.add(MAGNET);
        client.add(MAGNET);

        assertThat(transmission.handshakes).as("une seule poignée de main").isEqualTo(1);
        assertThat(transmission.calls("torrent-add")).hasSize(2);
    }

    @Test
    void addSendsBasicAuthAndImposesTheConfiguredDownloadDirectory() {
        transmission.handler = request -> FakeTransmission.Response.ok("{\"torrent-added\":{\"hashString\":\"" + HASH.toUpperCase() + "\"}}");

        String id = client.add(MAGNET);

        assertThat(id).as("identifiant en minuscules").isEqualTo(HASH);
        FakeTransmission.Received sent = transmission.calls("torrent-add").get(0);
        assertThat(sent.authorization())
            .isEqualTo("Basic " + Base64.getEncoder().encodeToString((USER + ":" + PASSWORD).getBytes()));
        assertThat(sent.body()).contains("\"download-dir\":\"/downloads/complete\"").contains("\"filename\":\"" + MAGNET + "\"");
    }

    @Test
    void addingTheSameTorrentTwiceReturnsTheSameId() {
        transmission.handler = request -> FakeTransmission.Response.ok("{\"torrent-duplicate\":{\"hashString\":\"" + HASH + "\"}}");

        assertThat(client.add(MAGNET)).isEqualTo(HASH);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {
        "http://169.254.169.254/latest/meta-data/",
        "https://exemple.org/film.torrent",
        "file:///etc/passwd",
        "/downloads/complete/autre.torrent",
        "magnet:?dn=Sintel",
        "magnet:?xt=urn:btih:abc123",
        "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10 http://interne",
        "",
    })
    void refusesAnythingButAMagnetWithoutCallingTheClient(String notAMagnet) {
        assertThatThrownBy(() -> client.add(notAMagnet)).isInstanceOf(IllegalArgumentException.class);

        assertThat(transmission.requests).as("aucune requête envoyée au client").isEmpty();
    }

    @Test
    void refusesAMagnetThatIsTooLong() {
        String tooLong = MAGNET + "&x=" + "a".repeat(2000);

        assertThatThrownBy(() -> client.add(tooLong)).isInstanceOf(IllegalArgumentException.class);
        assertThat(transmission.requests).isEmpty();
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"1", "recently-active", "08ADA5A7A6183AAE1E09D831DF6748D566095A10", HASH + ",2"})
    void refusesATorrentIdThatIsNotAnInfohash(String notAnId) {
        assertThatThrownBy(() -> client.status(notAnId)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> client.cancel(notAnId)).isInstanceOf(IllegalArgumentException.class);

        assertThat(transmission.requests).isEmpty();
    }

    // --- États ---------------------------------------------------------------------------------------------------

    @Test
    void aDownloadingTorrentReportsItsProgress() {
        serveTorrent(torrent(4, 0.42, 0, "", 1000, 580, 1.0, "[]"));

        assertThat(status()).isEqualTo(new TorrentStatus(TorrentStatus.State.DOWNLOADING, 42, null, List.of()));
    }

    @Test
    void aDownloadingTorrentWithoutPeersReportsSinceWhenItIsIdle() {
        serveTorrent(torrent(4, 0.1, 0, "", 1000, 900, 1.0, "[],\"peersConnected\":0,\"activityDate\":1700000000"));

        assertThat(status().idleSince()).isEqualTo(java.time.Instant.ofEpochSecond(1700000000));
    }

    @Test
    void aConnectedPeerMeansTheTorrentIsNotIdle() {
        serveTorrent(torrent(4, 0.1, 0, "", 1000, 900, 1.0, "[],\"peersConnected\":2,\"activityDate\":1700000000"));

        assertThat(status().idleSince()).isNull();
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 2, 3})
    void aWaitingOrCheckingTorrentIsQueued(int transmissionStatus) {
        serveTorrent(torrent(transmissionStatus, 0.0, 0, "", 1000, 1000, 1.0, "[]"));

        assertThat(status().state()).isEqualTo(TorrentStatus.State.QUEUED);
    }

    @Test
    void aMagnetWithoutMetadataIsNeverReportedAsCompleted() {
        // Pas encore de métadonnées : taille nulle et « rien à télécharger ». Ce piège ferait passer en COMPLETED
        // un téléchargement qui n'a pas commencé.
        serveTorrent(torrent(4, 0.0, 0, "", 0, 0, 0.0, "[]"));

        TorrentStatus status = status();

        assertThat(status.state()).isEqualTo(TorrentStatus.State.DOWNLOADING);
        assertThat(status.progressPercent()).isZero();
        assertThat(status.files()).isEmpty();
    }

    @Test
    void aCompletedTorrentListsItsFilesRelativeToTheDownloadsRoot() {
        serveTorrent(torrent(6, 1.0, 0, "", 129302391, 0, 1.0, "[{\"name\":\"Sintel/sintel.mp4\",\"length\":129302391}]"));

        assertThat(status()).isEqualTo(
            new TorrentStatus(TorrentStatus.State.COMPLETED, 100, null, List.of("complete/Sintel/sintel.mp4")));
    }

    @Test
    void neverReports100PercentBeforeTheTorrentIsComplete() {
        // percentDone arrondi à 1.0 alors qu'il reste un octet : sans plafond l'interface afficherait 100 % puis attendrait.
        serveTorrent(torrent(4, 1.0, 0, "", 1000, 1, 1.0, "[]"));

        assertThat(status().progressPercent()).isEqualTo(99);
    }

    @Test
    void filesWithAbsoluteOrEscapingNamesAreDropped() {
        serveTorrent(torrent(6, 1.0, 0, "", 10, 0, 1.0,
            "[{\"name\":\"../../etc/passwd\"},{\"name\":\"/abs/film.mkv\"},{\"name\":\"ok/film.mkv\"},{\"name\":\"a\\\\b.mkv\"},{\"name\":\"\"}]"));

        assertThat(status().files()).containsExactly("complete/ok/film.mkv");
    }

    @Test
    void aFullDiskIsReportedAsDiskFull() {
        serveTorrent(torrent(0, 0.3, 3, "No space left on device", 1000, 700, 1.0, "[]"));

        TorrentStatus status = status();

        assertThat(status.state()).isEqualTo(TorrentStatus.State.FAILED);
        assertThat(status.errorCode()).isEqualTo("DISK_FULL");
    }

    @Test
    void anotherLocalErrorIsReportedAsClientUnavailable() {
        serveTorrent(torrent(0, 0.3, 3, "Permission denied", 1000, 700, 1.0, "[]"));

        TorrentStatus status = status();

        assertThat(status.state()).isEqualTo(TorrentStatus.State.FAILED);
        assertThat(status.errorCode()).isEqualTo("TORRENT_CLIENT_UNAVAILABLE");
    }

    @Test
    void aTrackerErrorIsNotAFailure() {
        serveTorrent(torrent(4, 0.1, 2, "Tracker gave an error", 1000, 900, 1.0, "[]"));

        assertThat(status().state()).isEqualTo(TorrentStatus.State.DOWNLOADING);
    }

    @Test
    void aStoppedUnfinishedTorrentIsFailed() {
        serveTorrent(torrent(0, 0.5, 0, "", 1000, 500, 1.0, "[]"));

        TorrentStatus status = status();

        assertThat(status.state()).isEqualTo(TorrentStatus.State.FAILED);
        assertThat(status.errorCode()).isEqualTo("TORRENT_CLIENT_UNAVAILABLE");
    }

    @Test
    void anUnknownTorrentGivesAnEmptyStatus() {
        serveTorrent("{\"torrents\":[]}");

        assertThat(client.status(HASH)).isEqualTo(Optional.empty());
    }

    // --- Annulation ----------------------------------------------------------------------------------------------

    @Test
    void cancellingAnUnfinishedDownloadRemovesItAndItsPartialData() {
        serveTorrent(torrent(4, 0.3, 0, "", 1000, 700, 1.0, "[]"));

        client.cancel(HASH);

        assertThat(transmission.calls("torrent-remove")).hasSize(1);
        assertThat(transmission.calls("torrent-remove").get(0).body())
            .contains("\"delete-local-data\":true").contains("\"" + HASH + "\"");
    }

    @Test
    void cancellingACompletedTorrentNeverDeletesTheFile() {
        // Le fichier terminé peut déjà être dans le catalogue de Library : on retire le torrent, jamais les données.
        serveTorrent(torrent(6, 1.0, 0, "", 1000, 0, 1.0, "[{\"name\":\"film.mp4\"}]"));

        client.cancel(HASH);

        assertThat(transmission.calls("torrent-remove")).hasSize(1);
        assertThat(transmission.calls("torrent-remove").get(0).body()).contains("\"delete-local-data\":false");
    }

    @Test
    void cancellingAnUnknownTorrentDoesNothing() {
        serveTorrent("{\"torrents\":[]}");

        client.cancel(HASH);

        assertThat(transmission.calls("torrent-remove")).isEmpty();
    }

    // --- Panne du client -----------------------------------------------------------------------------------------

    private void assertUnavailable(Runnable call) {
        assertThatThrownBy(call::run).isInstanceOf(TorrentClientUnavailableException.class)
            .satisfies(e -> {
                ApiException api = (ApiException) e;
                assertThat(api.getStatus().value()).isEqualTo(503);
                assertThat(api.getCode()).isEqualTo("TORRENT_CLIENT_UNAVAILABLE");
                assertThat(api.getMessage()).doesNotContain(PASSWORD, USER, "127.0.0.1", "transmission/rpc");
            });
    }

    @Test
    void aStoppedClientIsABusinessError() throws Exception {
        String deadUrl = transmission.url();
        transmission.close();
        TransmissionClient stopped = new TransmissionClient(properties(deadUrl, Duration.ofSeconds(1)));

        assertUnavailable(() -> stopped.status(HASH));
        assertUnavailable(() -> stopped.add(MAGNET));
        assertUnavailable(() -> stopped.cancel(HASH));
    }

    @Test
    void wrongCredentialsAreABusinessError() {
        transmission.handler = request -> new FakeTransmission.Response(401, "Unauthorized");

        assertUnavailable(() -> client.status(HASH));
    }

    @Test
    void aServerErrorIsABusinessError() {
        transmission.handler = request -> new FakeTransmission.Response(500, "oups");

        assertUnavailable(() -> client.status(HASH));
    }

    @Test
    void aRefusedRequestIsABusinessError() {
        transmission.handler = request -> new FakeTransmission.Response(200, "{\"result\":\"invalid or corrupt torrent file\"}");

        assertUnavailable(() -> client.add(MAGNET));
    }

    @Test
    void anUnreadableReplyIsABusinessError() {
        transmission.handler = request -> new FakeTransmission.Response(200, "pas du json");

        assertUnavailable(() -> client.status(HASH));
    }

    @Test
    void aClientThatNeverRepliesFailsFastInsteadOfBlocking() throws Exception {
        try (ServerSocket silent = new ServerSocket(0, 5, InetAddress.getLoopbackAddress())) {
            String url = "http://127.0.0.1:" + silent.getLocalPort() + "/transmission/rpc";
            TransmissionClient slow = new TransmissionClient(properties(url, Duration.ofMillis(600)));

            long start = System.nanoTime();
            assertUnavailable(() -> slow.status(HASH));

            assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(5));
        }
    }

    // --- Configuration -------------------------------------------------------------------------------------------

    @Test
    void thePasswordNeverAppearsInTheConfigurationText() {
        assertThat(properties("http://transmission:9091/transmission/rpc", Duration.ofSeconds(3)).toString())
            .doesNotContain(PASSWORD).doesNotContain(USER);
    }

    @Test
    void refusesADownloadDirectoryOutsideTheDownloadsRoot() {
        TransmissionProperties outside = new TransmissionProperties(transmission.url(), USER, PASSWORD,
            Duration.ofSeconds(1), "/etc", "/downloads");

        assertThatThrownBy(() -> new TransmissionClient(outside)).isInstanceOf(IllegalStateException.class);
    }
}
