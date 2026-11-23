package com.homeflix.acquisition.rights;

import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.homeflix.acquisition.api.ApiException;

/**
 * Rappel des droits d'auteur : chaque compte l'acquitte une fois par version du texte. Un changement de version
 * (`acquisition.rights.notice-version`) demande un nouvel acquittement.
 */
@Service
public class RightsNoticeService {

    static final String TEXT = """
            HomeFlix ne doit servir qu'à télécharger des contenus dont vous avez le droit de disposer : œuvres libres \
            de droits, sous licence libre ou dont les ayants droit ont autorisé la redistribution. Le catalogue ne \
            propose que des contenus dont la licence est documentée. Le téléchargement en pair à pair partage aussi \
            les données avec d'autres utilisateurs. En continuant, vous confirmez être responsable de l'usage que \
            vous faites de ces téléchargements.""";

    private final RightsAcknowledgementRepository acknowledgements;
    private final String version;

    public RightsNoticeService(RightsAcknowledgementRepository acknowledgements,
            @Value("${acquisition.rights.notice-version:2026-11}") String version) {
        this.acknowledgements = acknowledgements;
        this.version = version;
    }

    public RightsNoticeResponse notice(UUID accountId) {
        return acknowledgements.findById(new RightsAcknowledgementId(accountId, version))
                .map(a -> new RightsNoticeResponse(version, TEXT, true, a.getAcknowledgedAt()))
                .orElseGet(() -> new RightsNoticeResponse(version, TEXT, false, null));
    }

    /** Idempotent : acquitter une version déjà acquittée renvoie l'acquittement existant. */
    public RightsNoticeResponse acknowledge(UUID accountId, String noticeVersion) {
        if (!version.equals(noticeVersion)) {
            throw new ApiException(HttpStatus.CONFLICT, "CONFLICT", "Version périmée",
                    "Le rappel des droits a changé : relisez-le avant de l'acquitter.");
        }
        RightsAcknowledgementId id = new RightsAcknowledgementId(accountId, version);
        if (!acknowledgements.existsById(id)) {
            try {
                acknowledgements.saveAndFlush(new RightsAcknowledgement(accountId, version));
            } catch (DataIntegrityViolationException e) {
                // Deux acquittements simultanés : l'autre a gagné, le résultat est le même.
            }
        }
        return notice(accountId);
    }

    public boolean isAcknowledged(UUID accountId) {
        return acknowledgements.existsById(new RightsAcknowledgementId(accountId, version));
    }
}
