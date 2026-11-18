package com.homeflix.library.catalogue;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Média du catalogue tel que le voit le client (jamais de chemin disque). */
public record MediaView(UUID id, String title, String description, String posterUrl, List<String> genres,
        Integer year, Integer durationSeconds, String availability, Instant addedAt) {
}
