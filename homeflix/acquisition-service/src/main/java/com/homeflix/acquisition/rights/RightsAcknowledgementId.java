package com.homeflix.acquisition.rights;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

/** Clé d'un acquittement : un compte acquitte chaque version du rappel une seule fois. */
@Embeddable
public record RightsAcknowledgementId(
        @Column(name = "account_id") UUID accountId,
        @Column(name = "notice_version") String noticeVersion) {
}
