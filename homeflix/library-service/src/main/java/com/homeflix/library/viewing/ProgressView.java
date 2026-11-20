package com.homeflix.library.viewing;

import java.time.Instant;
import java.util.UUID;

public record ProgressView(UUID mediaId, int positionSeconds, Integer durationSeconds, ProgressState state,
        Instant updatedAt) {

    /** Média jamais lu par ce profil. */
    static ProgressView notStarted(UUID mediaId) {
        return new ProgressView(mediaId, 0, null, ProgressState.NOT_STARTED, null);
    }

    static ProgressView from(Progress p) {
        return new ProgressView(p.getMedia().getId(), p.getPositionSeconds(), p.getDurationSeconds(), p.getState(),
            p.getUpdatedAt());
    }
}
