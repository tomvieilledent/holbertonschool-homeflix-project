package com.homeflix.identity.account;

import java.util.UUID;

/** Demande à Acquisition d'effacer les données d'un compte supprimé. */
public interface AcquisitionPurgeClient {

    /** @throws com.homeflix.identity.error.ApiException ACQUISITION_UNAVAILABLE (503) si Acquisition ne répond pas. */
    void purgeAccount(UUID accountId);
}
