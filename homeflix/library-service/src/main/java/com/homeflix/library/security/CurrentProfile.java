package com.homeflix.library.security;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

import com.homeflix.library.api.ApiException;

/**
 * Compte et profil actif de l'appelant, lus dans le JWT (`sub` et `pid`), jamais dans l'URL ni le corps.
 * Les routes liées au profil appellent {@link #profileId()} : sans `pid`, 409 PROFILE_NOT_SELECTED.
 */
@Component
public class CurrentProfile {

    public UUID accountId() {
        return uuid(jwt().getSubject());
    }

    public UUID profileId() {
        String pid = jwt().getClaimAsString("pid");
        if (pid == null || pid.isBlank()) {
            throw new ApiException(HttpStatus.CONFLICT, "PROFILE_NOT_SELECTED", "Aucun profil sélectionné",
                "Sélectionnez un profil pour accéder à cette ressource.");
        }
        return uuid(pid);
    }

    private static Jwt jwt() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof Jwt jwt) {
            return jwt;
        }
        throw new ApiException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "Authentification requise",
            "Authentification requise.");
    }

    private static UUID uuid(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "Authentification requise",
                "Authentification requise.");
        }
    }
}
