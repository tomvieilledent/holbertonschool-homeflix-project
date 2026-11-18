package com.homeflix.library.catalogue;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.homeflix.library.api.ApiException;
import com.homeflix.library.media.Availability;

@Service
public class MediaCatalogueService {

    static final int MAX_SIZE = 50;
    static final int MAX_QUERY = 100;

    private final MediaCatalogueRepository repository;

    public MediaCatalogueService(MediaCatalogueRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public MediaPage list(String q, String genre, String availability, String sort, int page, int size) {
        if (page < 0) {
            throw ApiException.validation("page", "La page doit être positive ou nulle.");
        }
        if (size < 1 || size > MAX_SIZE) {
            throw ApiException.validation("size", "La taille doit être comprise entre 1 et " + MAX_SIZE + ".");
        }
        String query = blankToNull(q);
        if (query != null && query.length() > MAX_QUERY) {
            throw ApiException.validation("q", "La recherche ne doit pas dépasser " + MAX_QUERY + " caractères.");
        }
        var filter = new MediaCatalogueRepository.Filter(query, blankToNull(genre), parseAvailability(availability));
        long total = repository.count(filter);
        List<MediaView> items = repository.search(filter, parseSort(sort), size, (long) page * size);
        return new MediaPage(items, page, size, total, (int) ((total + size - 1) / size));
    }

    @Transactional(readOnly = true)
    public MediaView get(UUID id) {
        return repository.findById(id).orElseThrow(() -> ApiException.notFound("Ce média est introuvable."));
    }

    @Transactional(readOnly = true)
    public List<String> genres() {
        return repository.genres();
    }

    private static MediaCatalogueRepository.Sort parseSort(String sort) {
        if (sort == null || sort.isBlank()) {
            return MediaCatalogueRepository.Sort.ADDED_AT_DESC;
        }
        return switch (sort) {
            case "addedAt,desc" -> MediaCatalogueRepository.Sort.ADDED_AT_DESC;
            case "title,asc" -> MediaCatalogueRepository.Sort.TITLE_ASC;
            case "year,desc" -> MediaCatalogueRepository.Sort.YEAR_DESC;
            default -> throw ApiException.validation("sort", "Tri non supporté (addedAt,desc, title,asc ou year,desc).");
        };
    }

    private static String parseAvailability(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Availability.valueOf(value.toUpperCase(Locale.ROOT)).name();
        } catch (IllegalArgumentException e) {
            throw ApiException.validation("availability", "Valeur attendue : AVAILABLE, UNAVAILABLE ou DOWNLOADING.");
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
