package com.homeflix.identity.auth;

import java.util.UUID;

import com.homeflix.identity.setup.AccountResponse;

/**
 * Session courante (contrat : schéma `Me`) : le compte et le profil actif. `activeProfileId` est nul tant qu'aucun
 * profil n'est sélectionné, ou si le profil du jeton n'existe plus.
 */
public record MeResponse(AccountResponse account, UUID activeProfileId) {
}
