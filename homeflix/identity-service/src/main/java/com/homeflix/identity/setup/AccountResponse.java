package com.homeflix.identity.setup;

import java.time.Instant;
import java.util.UUID;

import com.homeflix.identity.account.Account;

/** Représentation publique d'un compte (jamais de hachage). */
public record AccountResponse(UUID id, String username, String email, String role, boolean enabled,
        boolean mustChangePassword, Instant createdAt) {

    public static AccountResponse from(Account a) {
        return new AccountResponse(a.getId(), a.getUsername(), a.getEmail(), a.getRole().getName(),
            a.isEnabled(), a.isMustChangePassword(), a.getCreatedAt());
    }
}
