package com.homeflix.acquisition.download;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.homeflix.acquisition.api.ApiException;
import com.homeflix.acquisition.catalogue.CatalogueEntry;
import com.homeflix.acquisition.catalogue.CatalogueEntryRepository;
import com.homeflix.acquisition.catalogue.CatalogueService;
import com.homeflix.acquisition.catalogue.DownloadSource;
import com.homeflix.acquisition.library.LibraryClient;
import com.homeflix.acquisition.library.LibraryRejectedException;
import com.homeflix.acquisition.library.LibraryUnavailableException;
import com.homeflix.acquisition.rights.RightsNoticeService;
import com.homeflix.acquisition.torrent.TorrentClient;
import com.homeflix.acquisition.torrent.TorrentClientUnavailableException;

/**
 * Démarrage, suivi et annulation des téléchargements. Machine d'états : QUEUED → DOWNLOADING → COMPLETED / FAILED,
 * et CANCELLED depuis QUEUED ou DOWNLOADING. Le lien magnet vient toujours du catalogue ; le client BitTorrent n'est
 * appelé qu'à travers {@link TorrentClient}.
 *
 * <p>Les méthodes qui parlent au client BitTorrent ne sont pas transactionnelles : aucune connexion à la base n'est
 * gardée pendant un appel réseau, et chaque changement d'état est enregistré tout de suite.
 */
@Service
public class DownloadService {

    private static final Logger log = LoggerFactory.getLogger(DownloadService.class);

    private final DownloadRepository downloads;
    private final CatalogueEntryRepository entries;
    private final CatalogueService catalogue;
    private final RightsNoticeService rights;
    private final TorrentClient torrent;
    private final LibraryClient library;

    public DownloadService(DownloadRepository downloads, CatalogueEntryRepository entries, CatalogueService catalogue,
            RightsNoticeService rights, TorrentClient torrent, LibraryClient library) {
        this.downloads = downloads;
        this.entries = entries;
        this.catalogue = catalogue;
        this.rights = rights;
        this.torrent = torrent;
        this.library = library;
    }

    public DownloadResponse start(UUID entryId, UUID accountId) {
        if (!rights.isAcknowledged(accountId)) {
            throw new ApiException(HttpStatus.PRECONDITION_FAILED, "RIGHTS_NOT_ACKNOWLEDGED",
                    "Rappel des droits non acquitté", "Lisez et acquittez le rappel des droits avant de télécharger.");
        }
        DownloadSource source = catalogue.sourceFor(entryId);
        if (downloads.findByEntryIdAndStateIn(entryId, DownloadState.ACTIVE).isPresent()) {
            throw alreadyActive();
        }
        Download download = new Download(entryId, accountId);
        try {
            // L'index unique partiel garantit un seul téléchargement actif par entrée, même en cas de requêtes simultanées.
            downloads.saveAndFlush(download);
        } catch (DataIntegrityViolationException e) {
            throw alreadyActive();
        }
        try {
            download.setTorrentId(torrent.add(source.magnetUri()));
            download.setState(DownloadState.DOWNLOADING);
        } catch (TorrentClientUnavailableException e) {
            download.setState(DownloadState.FAILED);
            download.setErrorCode("TORRENT_CLIENT_UNAVAILABLE");
            download.setFinishedAt(Instant.now());
            downloads.save(download);
            throw e;
        }
        return toResponse(downloads.save(download), source.title());
    }

    public DownloadResponse cancel(UUID id) {
        Download download = downloads.findById(id).orElseThrow(DownloadService::notFound);
        if (download.getState() == DownloadState.CANCELLED) {
            return toResponse(download);
        }
        if (!DownloadState.ACTIVE.contains(download.getState())) {
            throw new ApiException(HttpStatus.CONFLICT, "CONFLICT", "Annulation impossible",
                    "Ce téléchargement est terminé : il ne peut plus être annulé.");
        }
        if (download.getTorrentId() != null) {
            torrent.cancel(download.getTorrentId());   // 503 si le client est injoignable : l'état ne change pas
        }
        download.setState(DownloadState.CANCELLED);
        download.setFinishedAt(Instant.now());
        Download saved = downloads.save(download);
        if (saved.getFileRelativePath() != null) {
            try {
                library.registerFailed(saved.getFileRelativePath());
            } catch (LibraryUnavailableException | LibraryRejectedException e) {
                log.warn("Library n'a pas pu être prévenue de l'annulation d'un téléchargement");
            }
        }
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public DownloadResponse get(UUID id) {
        return toResponse(downloads.findById(id).orElseThrow(DownloadService::notFound));
    }

    @Transactional(readOnly = true)
    public DownloadPageResponse list(int page, int size, DownloadState state) {
        PageRequest pageable = PageRequest.of(page, size, Sort.by("createdAt").descending().and(Sort.by("id").descending()));
        Page<Download> result = state == null ? downloads.findAll(pageable) : downloads.findByState(state, pageable);
        Map<UUID, String> titles = titles(result.getContent());
        List<DownloadResponse> items = result.getContent().stream()
                .map(d -> toResponse(d, titles.getOrDefault(d.getEntryId(), "")))
                .toList();
        return new DownloadPageResponse(items, result.getNumber(), result.getSize(), result.getTotalElements(),
                result.getTotalPages());
    }

    private Map<UUID, String> titles(List<Download> list) {
        return entries.findAllById(list.stream().map(Download::getEntryId).distinct().toList()).stream()
                .collect(Collectors.toMap(CatalogueEntry::getId, CatalogueEntry::getTitle));
    }

    private DownloadResponse toResponse(Download download) {
        Optional<CatalogueEntry> entry = entries.findById(download.getEntryId());
        return toResponse(download, entry.map(CatalogueEntry::getTitle).orElse(""));
    }

    private static DownloadResponse toResponse(Download d, String title) {
        String code = d.getErrorCode();
        return new DownloadResponse(d.getId(), d.getEntryId(), title, d.getState(), d.getProgressPercent(), code,
                messageFor(code), null, d.getCreatedAt(), d.getFinishedAt());
    }

    /** Message lisible, sans détail technique (le frontend choisit son propre texte à partir du code). */
    static String messageFor(String code) {
        if (code == null) {
            return null;
        }
        return switch (code) {
            case "NO_PEERS" -> "Aucune source ne partage ce fichier pour le moment.";
            case "DISK_FULL" -> "Il n'y a plus assez de place sur le disque.";
            case "TORRENT_CLIENT_UNAVAILABLE" -> "Le service de téléchargement est indisponible.";
            case "LIBRARY_UNAVAILABLE" -> "Le fichier est téléchargé mais la bibliothèque est indisponible.";
            case "LIBRARY_REJECTED" -> "Le fichier est téléchargé mais la bibliothèque l'a refusé.";
            case "INVALID_FILE" -> "Le fichier téléchargé n'est pas une vidéo reconnue.";
            default -> "Le téléchargement a échoué.";
        };
    }

    private static ApiException alreadyActive() {
        return new ApiException(HttpStatus.CONFLICT, "DOWNLOAD_ALREADY_ACTIVE", "Téléchargement déjà actif",
                "Un téléchargement de cette entrée est déjà en cours.");
    }

    private static ApiException notFound() {
        return ApiException.notFound("Ce téléchargement est introuvable.");
    }
}
