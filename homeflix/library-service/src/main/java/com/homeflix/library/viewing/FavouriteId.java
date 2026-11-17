package com.homeflix.library.viewing;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

/** Clé d'un favori : un média n'apparaît qu'une fois dans la liste d'un profil. */
@Embeddable
public record FavouriteId(
        @Column(name = "profile_id") UUID profileId,
        @Column(name = "media_id") UUID mediaId) {
}
