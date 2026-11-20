package com.homeflix.library.internal;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.homeflix.library.api.ApiException;
import com.homeflix.library.files.SafePathResolver;
import com.homeflix.library.files.UnsafePathException;
import com.homeflix.library.index.IndexService;
import com.homeflix.library.index.IndexStatus;
import com.homeflix.library.index.IndexWriter;
import com.homeflix.library.index.VideoFiles;
import com.homeflix.library.media.Availability;
import com.homeflix.library.media.MediaItem;
import com.homeflix.library.media.MediaItemRepository;
import com.homeflix.library.media.MediaMetadata;
import com.homeflix.library.media.MediaMetadataRepository;
import com.homeflix.library.media.MediaRoot;
import com.homeflix.library.media.MediaRootRepository;

/** Opérations réservées aux autres services (Identity, Acquisition). Voir docs/api/internal.md. */
@Service
public class InternalService {

    private final NamedParameterJdbcTemplate jdbc;
    private final MediaRootRepository roots;
    private final MediaItemRepository items;
    private final MediaMetadataRepository metadata;
    private final IndexWriter writer;
    private final IndexService indexService;
    private final SafePathResolver resolver;
    private final String downloadsRoot;

    public InternalService(NamedParameterJdbcTemplate jdbc, MediaRootRepository roots, MediaItemRepository items,
            MediaMetadataRepository metadata, IndexWriter writer, IndexService indexService,
            SafePathResolver resolver, @Value("${library.downloads-root:/downloads}") String downloadsRoot) {
        this.jdbc = jdbc;
        this.roots = roots;
        this.items = items;
        this.metadata = metadata;
        this.writer = writer;
        this.indexService = indexService;
        this.resolver = resolver;
        this.downloadsRoot = downloadsRoot;
    }

    /** Supprime favoris et progression ; idempotent. Les médias et les fichiers ne sont jamais touchés. */
    @Transactional
    public void purge(PurgeRequest request) {
        boolean profile = "PROFILE".equals(request.scope());
        String column = profile ? "profile_id" : "account_id"; // constante, jamais une valeur du client
        UUID id = profile ? request.profileId() : request.accountId();
        MapSqlParameterSource params = new MapSqlParameterSource("id", id);
        jdbc.update("DELETE FROM favourites WHERE " + column + " = :id", params);
        jdbc.update("DELETE FROM progress WHERE " + column + " = :id", params);
    }

    /** Fait apparaître le fichier en cours de téléchargement dans le catalogue, statut DOWNLOADING. */
    @Transactional
    public UUID markDownloading(DownloadRequest request) {
        MediaRoot root = downloadsRoot();
        String relative = relativeInsideRoot(root, request.relativePath());
        MediaItem item = items.findByRootIdAndRelativePath(root.getId(), relative).orElse(null);
        boolean created = item == null;
        if (created) {
            item = items.save(new MediaItem(root, relative, 0, Instant.now(), "downloading"));
            String title = request.title() == null || request.title().isBlank()
                ? VideoFiles.titleFrom(relative) : request.title().strip();
            metadata.save(new MediaMetadata(item, title));
        } else if (item.isDeleted()) {
            throw new ApiException(HttpStatus.CONFLICT, "CONFLICT", "Conflit", "Cette entrée a été retirée du catalogue.");
        }
        // Une entrée déjà lisible (fichier présent) n'est pas rétrogradée par un nouveau téléchargement.
        if (created || item.getAvailability() == Availability.UNAVAILABLE) {
            item.setAvailability(Availability.DOWNLOADING);
        }
        return item.getId();
    }

    /** Enregistre le fichier terminé : il doit exister dans le dossier de téléchargements et être une vidéo. */
    @Transactional
    public UUID registerCompleted(DownloadRequest request) {
        MediaRoot root = downloadsRoot();
        String relative = relativeInsideRoot(root, request.relativePath());
        Path file;
        try {
            file = resolver.resolveInside(Path.of(root.getPath()), relative);
            if (!Files.isRegularFile(file) || !VideoFiles.isVideo(file)) {
                throw new ApiException(HttpStatus.NOT_FOUND, "MEDIA_FILE_MISSING", "Fichier introuvable",
                    "Le fichier terminé est introuvable ou n'est pas une vidéo prise en charge.");
            }
            IndexWriter.Outcome outcome = writer.upsert(root.getId(), relative, Files.size(file),
                Files.getLastModifiedTime(file).toInstant());
            if (outcome.result() == IndexWriter.Result.SKIPPED) {
                throw new ApiException(HttpStatus.CONFLICT, "CONFLICT", "Conflit",
                    "Cette entrée a été retirée du catalogue.");
            }
            MediaItem item = items.findById(outcome.mediaId()).orElseThrow();
            item.setAvailability(Availability.AVAILABLE); // sort d'un éventuel DOWNLOADING
            return item.getId();
        } catch (UnsafePathException | NoSuchFileException e) {
            throw new ApiException(HttpStatus.NOT_FOUND, "MEDIA_FILE_MISSING", "Fichier introuvable",
                "Le fichier terminé est introuvable dans le dossier de téléchargements.");
        } catch (IOException e) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "MEDIA_FILE_MISSING", "Fichier inaccessible",
                "Le fichier terminé n'a pas pu être lu.");
        }
    }

    /** Relance l'indexation ; idempotent : si une indexation tourne déjà, son état est renvoyé. */
    public IndexStatus reindex() {
        try {
            return indexService.start();
        } catch (ApiException e) {
            if ("INDEX_ALREADY_RUNNING".equals(e.getCode())) {
                return indexService.status();
            }
            throw e;
        }
    }

    private MediaRoot downloadsRoot() {
        return roots.findByPathAndRemovedFalse(downloadsRoot).filter(MediaRoot::isEnabled)
            .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "CONFLICT", "Conflit",
                "Le dossier de téléchargements n'est pas déclaré comme dossier autorisé."));
    }

    /** Refuse tout chemin absolu ou contenant « .. » avant de toucher à la base ou au disque. */
    private static String relativeInsideRoot(MediaRoot root, String relativePath) {
        String relative = relativePath.strip().replace('\\', '/');
        if (relative.startsWith("/") || relative.indexOf('\0') >= 0
                || java.util.Arrays.asList(relative.split("/")).contains("..")) {
            throw ApiException.validation("relativePath", "Chemin relatif au dossier de téléchargements attendu.");
        }
        return relative;
    }
}
