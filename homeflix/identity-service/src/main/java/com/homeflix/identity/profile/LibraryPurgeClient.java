package com.homeflix.identity.profile;

import java.util.UUID;

/** Demande à Library de supprimer les données d'un profil (favoris, progression). */
public interface LibraryPurgeClient {

    /** @throws com.homeflix.identity.error.ApiException LIBRARY_UNAVAILABLE (503) si Library ne répond pas. */
    void purgeProfile(UUID profileId);

    /** Supprime les données de tous les profils d'un compte (suppression du compte). Mêmes erreurs. */
    void purgeAccount(UUID accountId);
}
