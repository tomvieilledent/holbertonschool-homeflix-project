package com.homeflix.library.index;

import java.time.Instant;
import java.util.UUID;

/** Instantané de la progression, renvoyé par GET /admin/index/status. */
public record IndexStatus(
        UUID jobId,
        IndexState state,
        int scanned,
        int added,
        int updated,
        int markedUnavailable,
        int duplicates,
        int errors,
        Instant startedAt,
        Instant finishedAt) {

    /** Aucune indexation n'a encore eu lieu depuis le démarrage du service. */
    public static final IndexStatus IDLE = new IndexStatus(new UUID(0, 0), IndexState.IDLE, 0, 0, 0, 0, 0, 0, null, null);
}
