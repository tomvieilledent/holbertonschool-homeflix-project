package com.homeflix.library.viewing;

import java.time.Instant;
import java.util.UUID;

import com.homeflix.library.media.MediaItem;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import jakarta.persistence.Table;

/**
 * Favori (« Ma liste ») d'un profil. `accountId` et `profileId` viennent du jeton d'Identity :
 * aucune clé étrangère vers Identity, la purge d'un compte passe par un appel interne.
 */
@Entity
@Table(name = "favourites")
public class Favourite {

    @EmbeddedId
    private FavouriteId id;

    @Column(name = "account_id", nullable = false)
    private UUID accountId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @MapsId("mediaId")
    @JoinColumn(name = "media_id")
    private MediaItem media;

    @Column(name = "added_at", nullable = false)
    private Instant addedAt = Instant.now();

    protected Favourite() {
    }

    public Favourite(UUID accountId, UUID profileId, MediaItem media) {
        this.id = new FavouriteId(profileId, media.getId());
        this.accountId = accountId;
        this.media = media;
    }

    public FavouriteId getId() { return id; }
    public UUID getAccountId() { return accountId; }
    public UUID getProfileId() { return id.profileId(); }
    public MediaItem getMedia() { return media; }
    public Instant getAddedAt() { return addedAt; }
}
