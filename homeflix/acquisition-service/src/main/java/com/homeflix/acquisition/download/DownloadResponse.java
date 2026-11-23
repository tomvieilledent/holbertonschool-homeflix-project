package com.homeflix.acquisition.download;

import java.time.Instant;
import java.util.UUID;

/**
 * Téléchargement tel que l'API le renvoie (contrat `Download`). Ni identifiant du client BitTorrent, ni lien magnet,
 * ni chemin de fichier : ce record est la seule forme sous laquelle un téléchargement quitte le service.
 */
public record DownloadResponse(
        UUID id,
        UUID catalogueEntryId,
        String title,
        DownloadState state,
        int progressPercent,
        String errorCode,
        String errorMessage,
        UUID libraryMediaId,
        Instant createdAt,
        Instant finishedAt) {
}
