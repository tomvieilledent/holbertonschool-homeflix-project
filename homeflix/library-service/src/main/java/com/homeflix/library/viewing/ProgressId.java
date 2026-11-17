package com.homeflix.library.viewing;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

/** Clé d'une progression : une seule ligne par couple (profil, média). */
@Embeddable
public record ProgressId(
        @Column(name = "profile_id") UUID profileId,
        @Column(name = "media_id") UUID mediaId) {
}
