package com.homeflix.acquisition.rights;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/**
 * Acquittement du rappel des droits d'auteur, requis avant le premier téléchargement d'un compte.
 * `accountId` vient du jeton d'Identity : aucune clé étrangère, la purge d'un compte passe par un appel interne.
 */
@Entity
@Table(name = "rights_acknowledgements")
public class RightsAcknowledgement {

    @EmbeddedId
    private RightsAcknowledgementId id;

    @Column(name = "acknowledged_at", nullable = false)
    private Instant acknowledgedAt = Instant.now();

    protected RightsAcknowledgement() {
    }

    public RightsAcknowledgement(UUID accountId, String noticeVersion) {
        this.id = new RightsAcknowledgementId(accountId, noticeVersion);
    }

    public RightsAcknowledgementId getId() { return id; }
    public UUID getAccountId() { return id.accountId(); }
    public String getNoticeVersion() { return id.noticeVersion(); }
    public Instant getAcknowledgedAt() { return acknowledgedAt; }
}
