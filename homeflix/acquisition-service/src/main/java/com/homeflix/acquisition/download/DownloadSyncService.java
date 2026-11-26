package com.homeflix.acquisition.download;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.homeflix.acquisition.catalogue.CatalogueEntry;
import com.homeflix.acquisition.catalogue.CatalogueEntryRepository;
import com.homeflix.acquisition.library.LibraryClient;
import com.homeflix.acquisition.library.LibraryRejectedException;
import com.homeflix.acquisition.library.LibraryUnavailableException;
import com.homeflix.acquisition.torrent.TorrentClient;
import com.homeflix.acquisition.torrent.TorrentClientUnavailableException;
import com.homeflix.acquisition.torrent.TorrentStatus;

/**
 * Synchronise les téléchargements actifs avec le client BitTorrent. Un tick ne lève jamais d'exception : un client
 * injoignable est toléré quelques ticks, puis les téléchargements actifs passent en FAILED (message lisible).
 * À la complétion, le fichier vidéo est vérifié (extension, chemin relatif sûr) puis déclaré à Library.
 *
 * <p>Aucune transaction n'enveloppe les appels réseau ; chaque changement d'état est enregistré tout de suite, et
 * un téléchargement annulé entre-temps n'est jamais réécrit.
 */
@Service
public class DownloadSyncService {

    private static final Logger log = LoggerFactory.getLogger(DownloadSyncService.class);
    /** Mêmes extensions que l'indexation de Library : tout autre fichier y serait refusé. */
    static final Set<String> VIDEO_EXTENSIONS = Set.of("mp4", "mkv", "webm");

    private final DownloadRepository downloads;
    private final CatalogueEntryRepository entries;
    private final TorrentClient torrent;
    private final LibraryClient library;
    private final Duration noPeersTimeout;
    private final int unavailableTicks;
    private int consecutiveClientFailures;

    public DownloadSyncService(DownloadRepository downloads, CatalogueEntryRepository entries, TorrentClient torrent,
            LibraryClient library, @Value("${acquisition.sync.no-peers-timeout:15m}") Duration noPeersTimeout,
            @Value("${acquisition.sync.unavailable-ticks:6}") int unavailableTicks) {
        this.downloads = downloads;
        this.entries = entries;
        this.torrent = torrent;
        this.library = library;
        this.noPeersTimeout = noPeersTimeout;
        this.unavailableTicks = unavailableTicks;
    }

    /** Un passage de synchronisation ; ne lève jamais. */
    public synchronized void sync() {
        try {
            removeAbandonedTorrents();
            List<Download> active = downloads.findByStateIn(DownloadState.ACTIVE).stream()
                .filter(d -> d.getTorrentId() != null).toList();
            if (active.isEmpty()) {
                consecutiveClientFailures = 0;
                return;
            }
            boolean clientReachable = true;
            for (Download download : active) {
                try {
                    syncOne(download.getId(), download.getTorrentId());
                    consecutiveClientFailures = 0;
                } catch (TorrentClientUnavailableException e) {
                    clientReachable = false;
                    break;
                } catch (RuntimeException e) {
                    log.error("Synchronisation du téléchargement {} en échec", download.getId(), e);
                }
            }
            if (!clientReachable && ++consecutiveClientFailures >= unavailableTicks) {
                active.forEach(d -> fail(d.getId(), "TORRENT_CLIENT_UNAVAILABLE"));
                consecutiveClientFailures = 0;
            }
        } catch (RuntimeException e) {
            log.error("Synchronisation des téléchargements en échec", e);
        }
    }

    /**
     * Un téléchargement passé en FAILED parce que le client était injoignable laisse son torrent dans le client :
     * il reprendrait seul au redémarrage, sans que HomeFlix le sache. Dès que le client répond, le torrent est
     * retiré (sans effacer de fichier terminé) et son identifiant oublié ; recliquer sur « Télécharger » repart de zéro.
     */
    private void removeAbandonedTorrents() {
        for (Download d : downloads.findByStateAndErrorCodeAndTorrentIdIsNotNull(DownloadState.FAILED,
                "TORRENT_CLIENT_UNAVAILABLE")) {
            try {
                torrent.cancel(d.getTorrentId());
            } catch (TorrentClientUnavailableException e) {
                return; // toujours injoignable : nouvelle tentative au prochain passage
            }
            d.setTorrentId(null);
            downloads.save(d);
        }
    }

    private void syncOne(UUID id, String torrentId) {
        Optional<TorrentStatus> status = torrent.status(torrentId);
        if (status.isEmpty()) {
            fail(id, "TORRENT_LOST");
            return;
        }
        TorrentStatus s = status.get();
        switch (s.state()) {
            case FAILED -> fail(id, s.errorCode() == null ? "DOWNLOAD_FAILED" : s.errorCode());
            case COMPLETED -> complete(id, s);
            case DOWNLOADING -> {
                if (s.idleSince() != null && withoutSourceTooLong(id, s.idleSince())) {
                    failWithoutSource(id, torrentId);
                    return;
                }
                update(id, d -> {
                    d.setState(DownloadState.DOWNLOADING);
                    d.setProgressPercent(s.progressPercent());
                });
                announce(id, s);
            }
            case QUEUED -> {
                if (withoutSourceTooLong(id, Instant.EPOCH)) {
                    failWithoutSource(id, torrentId);
                }
            }
        }
    }

    /** Vrai si rien ne s'est passé depuis le délai, compté au plus tôt à partir de la création du téléchargement. */
    private boolean withoutSourceTooLong(UUID id, Instant lastActivity) {
        return downloads.findById(id)
                .map(d -> d.getCreatedAt().isAfter(lastActivity) ? d.getCreatedAt() : lastActivity)
                .map(since -> Duration.between(since, Instant.now()).compareTo(noPeersTimeout) > 0)
                .orElse(false);
    }

    private void failWithoutSource(UUID id, String torrentId) {
        try {
            torrent.cancel(torrentId);
        } catch (TorrentClientUnavailableException e) {
            log.warn("Annulation du torrent sans source impossible : client indisponible");
        }
        fail(id, "NO_PEERS");
    }

    /**
     * Signale une fois à Library le fichier en cours, dès que son nom est connu. Sans effet sur le téléchargement :
     * si Library est injoignable, l'appel est retenté au passage suivant.
     */
    private void announce(UUID id, TorrentStatus s) {
        Optional<String> file = videoFile(s.files());
        Download current = downloads.findById(id).orElse(null);
        if (file.isEmpty() || current == null || current.getFileRelativePath() != null
                || !DownloadState.ACTIVE.contains(current.getState())) {
            return;
        }
        String title = entries.findById(current.getEntryId()).map(CatalogueEntry::getTitle).orElse(null);
        try {
            library.registerDownloading(file.get(), title);
        } catch (LibraryUnavailableException e) {
            return;
        } catch (LibraryRejectedException e) {
            // Refus définitif (dossier non déclaré, entrée retirée) : inutile de le rejouer.
            log.info("Library n'affichera pas le téléchargement {} comme en cours", id);
        }
        if (!update(id, d -> d.setFileRelativePath(file.get()))) {
            release(file.get()); // annulé pendant l'appel
        }
    }

    private void release(String relativePath) {
        try {
            library.registerFailed(relativePath);
        } catch (LibraryUnavailableException | LibraryRejectedException e) {
            log.warn("Library n'a pas pu être prévenue de l'arrêt d'un téléchargement");
        }
    }

    private void complete(UUID id, TorrentStatus s) {
        Optional<String> file = videoFile(s.files());
        if (file.isEmpty()) {
            fail(id, "INVALID_FILE");
            return;
        }
        Download current = downloads.findById(id).orElse(null);
        if (current == null || !DownloadState.ACTIVE.contains(current.getState())) {
            return;
        }
        String title = entries.findById(current.getEntryId()).map(CatalogueEntry::getTitle).orElse(null);
        try {
            library.registerCompleted(file.get(), title);
        } catch (LibraryUnavailableException e) {
            fail(id, "LIBRARY_UNAVAILABLE");
            return;
        } catch (LibraryRejectedException e) {
            fail(id, "LIBRARY_REJECTED");
            return;
        }
        update(id, d -> {
            d.setState(DownloadState.COMPLETED);
            d.setProgressPercent(100);
            d.setFileRelativePath(file.get());
            d.setFinishedAt(Instant.now());
        });
    }

    /** Premier fichier vidéo du torrent, chemin relatif sûr (ni absolu, ni `..`, ni NUL). */
    static Optional<String> videoFile(List<String> files) {
        return files.stream().filter(DownloadSyncService::isSafeVideoPath).findFirst();
    }

    static boolean isSafeVideoPath(String path) {
        if (path == null || path.isBlank() || path.startsWith("/") || path.contains("\\") || path.indexOf('\0') >= 0) {
            return false;
        }
        for (String part : path.split("/", -1)) {
            if (part.isEmpty() || part.equals("..") || part.equals(".")) {
                return false;
            }
        }
        int dot = path.lastIndexOf('.');
        return dot > 0 && VIDEO_EXTENSIONS.contains(path.substring(dot + 1).toLowerCase(Locale.ROOT));
    }

    private void fail(UUID id, String code) {
        boolean failed = update(id, d -> {
            d.setState(DownloadState.FAILED);
            d.setErrorCode(code);
            d.setFinishedAt(Instant.now());
        });
        if (failed) {
            downloads.findById(id).map(Download::getFileRelativePath).ifPresent(this::release);
        }
    }

    /** N'écrit que si le téléchargement est encore actif (une annulation concurrente reste CANCELLED). */
    private boolean update(UUID id, java.util.function.Consumer<Download> change) {
        Optional<Download> active = downloads.findById(id).filter(d -> DownloadState.ACTIVE.contains(d.getState()));
        active.ifPresent(d -> {
            change.accept(d);
            downloads.save(d);
        });
        return active.isPresent();
    }
}
