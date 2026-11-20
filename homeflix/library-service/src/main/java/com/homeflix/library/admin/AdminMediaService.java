package com.homeflix.library.admin;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.homeflix.library.api.ApiException;
import com.homeflix.library.catalogue.MediaCatalogueRepository;
import com.homeflix.library.catalogue.MediaView;
import com.homeflix.library.media.MediaItem;
import com.homeflix.library.media.MediaItemRepository;
import com.homeflix.library.media.MediaMetadata;
import com.homeflix.library.media.MediaMetadataRepository;

/**
 * Corrections de l'administrateur sur le catalogue. Ne touche qu'à la base : aucun accès au système de fichiers,
 * le fichier source n'est jamais modifié ni supprimé.
 */
@Service
public class AdminMediaService {

    private final MediaItemRepository items;
    private final MediaMetadataRepository metadata;
    private final MediaCatalogueRepository catalogue;

    public AdminMediaService(MediaItemRepository items, MediaMetadataRepository metadata,
            MediaCatalogueRepository catalogue) {
        this.items = items;
        this.metadata = metadata;
        this.catalogue = catalogue;
    }

    /** Marque les métadonnées « éditées » : l'indexation ne les écrase jamais. */
    @Transactional
    public MediaView update(UUID mediaId, MediaMetadataUpdate update) {
        if (update.isEmpty()) {
            throw ApiException.validation("title", "Indiquez au moins un champ à modifier.");
        }
        MediaItem item = active(mediaId);
        MediaMetadata meta = metadata.findById(item.getId()).orElseThrow(() -> notFound());
        if (update.title() != null) {
            String title = clean(update.title(), false);
            if (title.isEmpty()) {
                throw ApiException.validation("title", "Le titre ne peut pas être vide.");
            }
            meta.setTitle(title);
        }
        if (update.description() != null) {
            String description = clean(update.description(), true);
            meta.setDescription(description.isEmpty() ? null : description);
        }
        if (update.genres() != null) {
            meta.setGenres(cleanGenres(update.genres()));
        }
        if (update.year() != null) {
            meta.setYear(update.year());
        }
        meta.setEdited(true);
        metadata.saveAndFlush(meta);
        return catalogue.findById(mediaId).orElseThrow(() -> notFound());
    }

    /**
     * Retrait de l'entrée (suppression douce) : elle disparaît du catalogue et n'est jamais réindexée, mais la
     * ligne et le fichier restent. Les favoris et la progression référencent l'entrée et restent cohérents.
     */
    @Transactional
    public void remove(UUID mediaId) {
        MediaItem item = active(mediaId);
        item.setDeleted(true);
        items.saveAndFlush(item);
    }

    private MediaItem active(UUID mediaId) {
        return items.findById(mediaId).filter(i -> !i.isDeleted()).orElseThrow(() -> notFound());
    }

    private static List<String> cleanGenres(List<String> genres) {
        LinkedHashSet<String> unique = new LinkedHashSet<>();
        for (String genre : genres) {
            String cleaned = genre == null ? "" : clean(genre, false);
            if (cleaned.isEmpty()) {
                throw ApiException.validation("genres", "Un genre ne peut pas être vide.");
            }
            unique.add(cleaned);
        }
        return List.copyOf(unique);
    }

    /** Retire les caractères de contrôle (sauf les retours à la ligne de la description) et les espaces de bord. */
    static String clean(String value, boolean keepNewlines) {
        StringBuilder out = new StringBuilder(value.length());
        value.codePoints().forEach(cp -> {
            boolean newline = cp == '\n' || cp == '\r' || cp == '\t';
            if (Character.isISOControl(cp) && !(keepNewlines && newline)) {
                out.append(newline ? ' ' : "");
            } else {
                out.appendCodePoint(cp);
            }
        });
        return out.toString().strip();
    }

    private static ApiException notFound() {
        return ApiException.notFound("Ce média est introuvable.");
    }
}
