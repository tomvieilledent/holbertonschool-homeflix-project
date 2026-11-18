package com.homeflix.library.playback;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.homeflix.library.api.ApiException;
import com.homeflix.library.files.SafePathResolver;
import com.homeflix.library.media.Availability;
import com.homeflix.library.media.MediaItem;
import com.homeflix.library.media.MediaItemRepository;

/** Retrouve le fichier d'un média lisible ; le chemin disque n'est jamais exposé aux clients. */
@Service
public class PlaybackService {

    private final MediaItemRepository items;
    private final SafePathResolver resolver;

    public PlaybackService(MediaItemRepository items, SafePathResolver resolver) {
        this.items = items;
        this.resolver = resolver;
    }

    /**
     * @throws ApiException 404 NOT_FOUND (inconnu ou retiré), 409 MEDIA_UNAVAILABLE (indisponible ou en cours de
     *                      téléchargement), 404 MEDIA_FILE_MISSING (fichier absent, illisible ou hors racine)
     */
    @Transactional(readOnly = true)
    public Path locate(UUID mediaId) {
        MediaItem item = items.findById(mediaId).filter(i -> !i.isDeleted())
            .orElseThrow(() -> ApiException.notFound("Ce média est introuvable."));
        if (item.getAvailability() != Availability.AVAILABLE) {
            throw new ApiException(HttpStatus.CONFLICT, "MEDIA_UNAVAILABLE", "Média indisponible",
                "Ce média n'est pas disponible pour le moment.");
        }
        try {
            Path file = resolver.resolveInside(Path.of(item.getRoot().getPath()), item.getRelativePath());
            if (!Files.isRegularFile(file) || !Files.isReadable(file)) {
                throw missing();
            }
            return file;
        } catch (IOException | RuntimeException e) {
            if (e instanceof ApiException api) {
                throw api;
            }
            throw missing();
        }
    }

    private static ApiException missing() {
        return new ApiException(HttpStatus.NOT_FOUND, "MEDIA_FILE_MISSING", "Fichier introuvable",
            "Le fichier de ce film n'est plus accessible.");
    }
}
