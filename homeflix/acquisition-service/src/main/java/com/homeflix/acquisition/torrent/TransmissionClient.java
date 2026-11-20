package com.homeflix.acquisition.torrent;

import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Adaptateur Transmission : pilote le démon par son API RPC JSON (`/transmission/rpc`).
 *
 * <ul>
 *   <li><b>Poignée de main</b> : sans l'en-tête {@code X-Transmission-Session-Id}, Transmission répond 409 en le
 *       fournissant ; on le mémorise et on rejoue la requête une fois.</li>
 *   <li><b>Authentification</b> : Basic, identifiants de la configuration.</li>
 *   <li><b>Délais</b> : 3 s en connexion et en lecture ; tout échec (réseau, 401, 5xx, réponse inattendue) devient
 *       une {@link TorrentClientUnavailableException} sans détail technique.</li>
 *   <li><b>Destination imposée</b> : chaque ajout passe {@code download-dir} depuis la configuration ; l'appelant ne
 *       peut pas le choisir.</li>
 *   <li><b>Magnet seulement</b> : Transmission suit aussi des URL et des chemins de fichiers locaux ; on refuse tout
 *       ce qui n'est pas un lien {@code magnet:?xt=urn:btih:…}.</li>
 * </ul>
 */
public class TransmissionClient implements TorrentClient {

    private static final Logger log = LoggerFactory.getLogger(TransmissionClient.class);

    static final String SESSION_HEADER = "X-Transmission-Session-Id";
    private static final ParameterizedTypeReference<Map<String, Object>> JSON_OBJECT = new ParameterizedTypeReference<>() { };
    private static final Pattern MAGNET = Pattern.compile("^magnet:\\?xt=urn:btih:([0-9a-fA-F]{40}|[A-Za-z2-7]{32})(&\\S*)?$");
    private static final Pattern INFOHASH = Pattern.compile("^[0-9a-f]{40}$");
    private static final int MAX_MAGNET_LENGTH = 2000;

    /** Codes de statut de Transmission (`status` d'un torrent). */
    private static final int STOPPED = 0;
    private static final int CHECK_WAIT = 1;
    private static final int CHECKING = 2;
    private static final int DOWNLOAD_WAIT = 3;
    /** `error` d'un torrent : 3 = erreur locale (disque, droits). 1 et 2 (tracker) ne sont pas des échecs. */
    private static final int LOCAL_ERROR = 3;

    private static final List<String> STATUS_FIELDS = List.of("hashString", "status", "percentDone", "error",
        "errorString", "totalSize", "leftUntilDone", "metadataPercentComplete", "files");

    private final TransmissionProperties properties;
    private final RestClient http;
    /** Dossier des fichiers terminés, relatif à la racine des téléchargements (par exemple `complete`). */
    private final Path relativeDownloadDir;
    private volatile String sessionId;

    public TransmissionClient(TransmissionProperties properties) {
        this.properties = properties;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(properties.timeout());
        factory.setReadTimeout(properties.timeout());
        this.http = RestClient.builder().baseUrl(properties.url()).requestFactory(factory).build();
        Path root = Path.of(properties.downloadsRoot()).normalize();
        Path dir = Path.of(properties.downloadDir()).normalize();
        if (!dir.startsWith(root)) {
            throw new IllegalStateException("Le dossier de téléchargement doit se trouver dans la racine des téléchargements");
        }
        this.relativeDownloadDir = root.relativize(dir);
    }

    @Override
    public String add(String magnetUri) {
        if (magnetUri == null || magnetUri.length() > MAX_MAGNET_LENGTH || !MAGNET.matcher(magnetUri).matches()) {
            // Jamais d'URL ni de chemin de fichier : Transmission les suivrait. La valeur n'est pas recopiée dans l'erreur.
            throw new IllegalArgumentException("Seul un lien magnet (magnet:?xt=urn:btih:…) est accepté");
        }
        Map<String, Object> reply = call("torrent-add",
            Map.of("filename", magnetUri, "download-dir", properties.downloadDir(), "paused", false));
        Object added = reply.get("torrent-added") != null ? reply.get("torrent-added") : reply.get("torrent-duplicate");
        if (added instanceof Map<?, ?> torrent && torrent.get("hashString") instanceof String hash
                && INFOHASH.matcher(hash.toLowerCase(Locale.ROOT)).matches()) {
            return hash.toLowerCase(Locale.ROOT);
        }
        throw unavailable("réponse inattendue à torrent-add", null);
    }

    @Override
    public Optional<TorrentStatus> status(String torrentId) {
        return fetch(torrentId).map(torrent -> map(torrent, relativeDownloadDir));
    }

    @Override
    public void cancel(String torrentId) {
        Optional<Map<String, Object>> torrent = fetch(torrentId);
        if (torrent.isEmpty()) {
            return; // déjà retiré : idempotent
        }
        // Un torrent terminé garde son fichier (il peut être déjà dans le catalogue) ; un partiel perd ses données.
        boolean complete = map(torrent.get(), relativeDownloadDir).state() == TorrentStatus.State.COMPLETED;
        call("torrent-remove", Map.of("ids", List.of(torrentId), "delete-local-data", !complete));
    }

    // --- Lecture d'un torrent -------------------------------------------------------------------------------

    private Optional<Map<String, Object>> fetch(String torrentId) {
        if (torrentId == null || !INFOHASH.matcher(torrentId).matches()) {
            // Transmission accepte aussi des numéros et « recently-active » : on n'envoie que des infohash.
            throw new IllegalArgumentException("Identifiant de torrent invalide");
        }
        Map<String, Object> reply = call("torrent-get", Map.of("ids", List.of(torrentId), "fields", STATUS_FIELDS));
        if (reply.get("torrents") instanceof List<?> torrents && !torrents.isEmpty()
                && torrents.get(0) instanceof Map<?, ?> first) {
            @SuppressWarnings("unchecked")
            Map<String, Object> torrent = (Map<String, Object>) first;
            return Optional.of(torrent);
        }
        return Optional.empty();
    }

    /** Traduit un torrent de Transmission en {@link TorrentStatus} (visible pour les tests). */
    static TorrentStatus map(Map<String, Object> torrent, Path relativeDownloadDir) {
        int status = number(torrent.get("status")).intValue();
        int error = number(torrent.get("error")).intValue();
        double percentDone = number(torrent.get("percentDone")).doubleValue();
        long totalSize = number(torrent.get("totalSize")).longValue();
        long leftUntilDone = number(torrent.getOrDefault("leftUntilDone", totalSize)).longValue();
        double metadata = number(torrent.getOrDefault("metadataPercentComplete", 1)).doubleValue();

        if (error == LOCAL_ERROR) {
            String text = String.valueOf(torrent.getOrDefault("errorString", "")).toLowerCase(Locale.ROOT);
            boolean noSpace = text.contains("space") || text.contains("disk full");
            return new TorrentStatus(TorrentStatus.State.FAILED, progress(percentDone),
                noSpace ? "DISK_FULL" : "TORRENT_CLIENT_UNAVAILABLE", List.of());
        }
        // Un lien magnet sans métadonnées a une taille nulle et « rien à télécharger » : ce n'est pas un torrent terminé.
        boolean complete = totalSize > 0 && leftUntilDone == 0 && metadata >= 1.0;
        if (complete) {
            return new TorrentStatus(TorrentStatus.State.COMPLETED, 100, null, files(torrent, relativeDownloadDir));
        }
        int progress = progress(percentDone);
        return switch (status) {
            case CHECK_WAIT, CHECKING, DOWNLOAD_WAIT -> new TorrentStatus(TorrentStatus.State.QUEUED, progress, null, List.of());
            // Arrêté sans être terminé (jamais mis en pause par nous) : le client ne le téléchargera plus.
            case STOPPED -> new TorrentStatus(TorrentStatus.State.FAILED, progress, "TORRENT_CLIENT_UNAVAILABLE", List.of());
            default -> new TorrentStatus(TorrentStatus.State.DOWNLOADING, progress, null, List.of());
        };
    }

    /** 0 à 99 : jamais 100 tant que le torrent n'est pas terminé (le 100 est réservé à COMPLETED). */
    private static int progress(double percentDone) {
        return Math.min((int) Math.floor(Math.max(0, Math.min(1, percentDone)) * 100), 99);
    }

    /** Chemins relatifs à la racine des téléchargements ; tout nom absolu ou sortant du dossier est écarté. */
    private static List<String> files(Map<String, Object> torrent, Path relativeDownloadDir) {
        List<String> paths = new ArrayList<>();
        if (torrent.get("files") instanceof List<?> files) {
            for (Object file : files) {
                if (file instanceof Map<?, ?> entry && entry.get("name") instanceof String name && !name.isBlank()) {
                    try {
                        Path relative = relativeDownloadDir.resolve(name).normalize();
                        if (!Path.of(name).isAbsolute() && !name.contains("\\") && relative.startsWith(relativeDownloadDir)
                                && !relative.equals(relativeDownloadDir)) {
                            paths.add(relative.toString());
                        }
                    } catch (InvalidPathException ignored) {
                        // nom illisible : écarté
                    }
                }
            }
        }
        return paths;
    }

    private static Number number(Object value) {
        return value instanceof Number n ? n : 0;
    }

    // --- Protocole RPC --------------------------------------------------------------------------------------

    private record Reply(int status, String sessionId, Map<String, Object> body) { }

    private Map<String, Object> call(String method, Map<String, Object> arguments) {
        Map<String, Object> request = Map.of("method", method, "arguments", arguments);
        for (int attempt = 0; attempt < 2; attempt++) {
            Reply reply = send(request);
            if (reply.status() == 409 && reply.sessionId() != null) {
                this.sessionId = reply.sessionId(); // poignée de main : on rejoue avec l'identifiant de session
                continue;
            }
            return interpret(method, reply);
        }
        throw unavailable("poignée de main refusée deux fois", null);
    }

    private Reply send(Map<String, Object> request) {
        try {
            return http.post()
                .headers(headers -> {
                    headers.setBasicAuth(properties.user(), properties.password());
                    if (sessionId != null) {
                        headers.set(SESSION_HEADER, sessionId);
                    }
                })
                .contentType(MediaType.APPLICATION_JSON)
                .body(request)
                .exchange((req, res) -> {
                    int status = res.getStatusCode().value();
                    if (status == 409) {
                        return new Reply(status, res.getHeaders().getFirst(SESSION_HEADER), null);
                    }
                    return new Reply(status, null, status == 200 ? res.bodyTo(JSON_OBJECT) : null);
                });
        } catch (RestClientException | IllegalStateException e) {
            throw unavailable("appel impossible", e);
        }
    }

    private Map<String, Object> interpret(String method, Reply reply) {
        if (reply.status() != 200 || reply.body() == null) {
            throw unavailable(reply.status() == 401 || reply.status() == 403
                ? "identifiants refusés (HTTP " + reply.status() + ")" : "HTTP " + reply.status(), null);
        }
        if (!"success".equals(reply.body().get("result"))) {
            throw unavailable(method + " refusé : " + reply.body().get("result"), null);
        }
        return reply.body().get("arguments") instanceof Map<?, ?> arguments
            ? castObject(arguments) : Map.of();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> castObject(Map<?, ?> map) {
        return (Map<String, Object>) map;
    }

    /** Journalise la cause (sans identifiant ni mot de passe) et renvoie l'erreur métier générique. */
    private TorrentClientUnavailableException unavailable(String context, Throwable cause) {
        log.warn("Transmission injoignable ou en erreur ({}) : {}", properties.url(), context
            + (cause == null ? "" : " [" + cause.getClass().getSimpleName() + "]"));
        return new TorrentClientUnavailableException();
    }
}
