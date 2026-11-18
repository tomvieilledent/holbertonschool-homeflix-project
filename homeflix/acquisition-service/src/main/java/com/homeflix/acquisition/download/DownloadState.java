package com.homeflix.acquisition.download;

import java.util.Set;

/** État d'un téléchargement (voir le contrat OpenAPI et data-model.md). */
public enum DownloadState {
    QUEUED,
    DOWNLOADING,
    COMPLETED,
    FAILED,
    CANCELLED;

    /** États d'un téléchargement « actif » : au plus un par entrée du catalogue (index unique partiel en base). */
    public static final Set<DownloadState> ACTIVE = Set.of(QUEUED, DOWNLOADING);
}
