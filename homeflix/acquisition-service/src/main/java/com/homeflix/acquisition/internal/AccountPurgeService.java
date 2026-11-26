package com.homeflix.acquisition.internal;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.homeflix.acquisition.download.DownloadRepository;
import com.homeflix.acquisition.rights.RightsAcknowledgementRepository;

/**
 * Efface les traces d'un compte supprimé : ses acquittements des droits disparaissent, et ses téléchargements sont
 * anonymisés (l'historique et les films restent). Idempotent.
 */
@Service
public class AccountPurgeService {

    /** Auteur d'un téléchargement dont le compte a été supprimé : ne désigne aucun compte. */
    static final UUID DELETED_ACCOUNT = new UUID(0, 0);

    private final RightsAcknowledgementRepository acknowledgements;
    private final DownloadRepository downloads;

    public AccountPurgeService(RightsAcknowledgementRepository acknowledgements, DownloadRepository downloads) {
        this.acknowledgements = acknowledgements;
        this.downloads = downloads;
    }

    @Transactional
    public void purge(UUID accountId) {
        acknowledgements.deleteByAccountId(accountId);
        downloads.replaceRequester(accountId, DELETED_ACCOUNT);
    }
}
