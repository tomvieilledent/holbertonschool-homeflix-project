package com.homeflix.library.viewing;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.homeflix.library.api.ApiException;
import com.homeflix.library.catalogue.MediaCatalogueRepository;

/** Progression de lecture d'un profil. Le profil vient toujours du jeton, jamais de la requête. */
@Service
public class ProgressService {

    /** Part de la durée à partir de laquelle un média est considéré comme terminé. */
    static final double COMPLETED_RATIO = 0.95;

    private final ProgressRepository progress;
    private final MediaCatalogueRepository catalogue;

    public ProgressService(ProgressRepository progress, MediaCatalogueRepository catalogue) {
        this.progress = progress;
        this.catalogue = catalogue;
    }

    @Transactional(readOnly = true)
    public ProgressView get(UUID profileId, UUID mediaId) {
        requireMedia(mediaId);
        return progress.findById(new ProgressId(profileId, mediaId)).map(ProgressView::from)
            .orElseGet(() -> ProgressView.notStarted(mediaId));
    }

    /** Position bornée à la durée ; COMPLETED à partir de 95 % ; réécriture identique = même résultat. */
    @Transactional
    public ProgressView save(UUID accountId, UUID profileId, UUID mediaId, ProgressUpdate update) {
        requireMedia(mediaId);
        int duration = update.durationSeconds();
        int position = Math.min(update.positionSeconds(), duration);
        progress.upsert(accountId, profileId, mediaId, position, duration, stateOf(position, duration).name());
        return progress.findById(new ProgressId(profileId, mediaId)).map(ProgressView::from).orElseThrow();
    }

    /** Remet à NOT_STARTED en supprimant la ligne ; idempotent, y compris pour un média sans progression. */
    @Transactional
    public void reset(UUID profileId, UUID mediaId) {
        progress.remove(profileId, mediaId);
    }

    static ProgressState stateOf(int position, int duration) {
        if (position >= duration * COMPLETED_RATIO) {
            return ProgressState.COMPLETED;
        }
        return position > 0 ? ProgressState.STARTED : ProgressState.NOT_STARTED;
    }

    private void requireMedia(UUID mediaId) {
        catalogue.findById(mediaId).orElseThrow(() -> ApiException.notFound("Ce média est introuvable."));
    }
}
