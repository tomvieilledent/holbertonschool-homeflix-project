package com.homeflix.library.viewing;

import java.time.Instant;
import java.util.UUID;

import com.homeflix.library.media.MediaItem;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import jakarta.persistence.Table;

/** Progression de lecture d'un profil sur un média (position reprise, état de visionnage). */
@Entity
@Table(name = "progress")
public class Progress {

    @EmbeddedId
    private ProgressId id;

    @Column(name = "account_id", nullable = false)
    private UUID accountId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @MapsId("mediaId")
    @JoinColumn(name = "media_id")
    private MediaItem media;

    @Column(name = "position_seconds", nullable = false)
    private int positionSeconds;

    @Column(name = "duration_seconds", nullable = false)
    private int durationSeconds;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ProgressState state = ProgressState.NOT_STARTED;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected Progress() {
    }

    public Progress(UUID accountId, UUID profileId, MediaItem media) {
        this.id = new ProgressId(profileId, media.getId());
        this.accountId = accountId;
        this.media = media;
    }

    public ProgressId getId() { return id; }
    public UUID getAccountId() { return accountId; }
    public UUID getProfileId() { return id.profileId(); }
    public MediaItem getMedia() { return media; }
    public int getPositionSeconds() { return positionSeconds; }
    public int getDurationSeconds() { return durationSeconds; }
    public ProgressState getState() { return state; }
    public Instant getUpdatedAt() { return updatedAt; }

    /** Enregistre la position courante et recalcule l'état (STARTED tant que la lecture n'est pas finie). */
    public void update(int positionSeconds, int durationSeconds, ProgressState state) {
        this.positionSeconds = positionSeconds;
        this.durationSeconds = durationSeconds;
        this.state = state;
        this.updatedAt = Instant.now();
    }
}
