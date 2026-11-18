package com.homeflix.acquisition.catalogue;

import java.util.UUID;

/**
 * Entrée du catalogue telle que l'API la renvoie (contrat `CatalogueEntry`). Elle ne contient ni lien magnet, ni
 * empreinte, ni identifiant du client BitTorrent, ni chemin du système de fichiers : ce record est la seule forme
 * sous laquelle une entrée quitte le service.
 */
public record CatalogueEntryResponse(
        UUID id,
        String title,
        String source,
        String license,
        String licenseProofUrl,
        long sizeBytes,
        boolean inLibrary,
        UUID libraryMediaId,
        UUID activeDownloadId) {
}
