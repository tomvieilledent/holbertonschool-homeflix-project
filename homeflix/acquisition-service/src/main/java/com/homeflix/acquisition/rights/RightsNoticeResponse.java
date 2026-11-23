package com.homeflix.acquisition.rights;

import java.time.Instant;

/** Rappel des droits et acquittement du compte courant (contrat `RightsNotice`). */
public record RightsNoticeResponse(String version, String text, boolean acknowledged, Instant acknowledgedAt) {
}
