package com.homeflix.acquisition.security;

import java.util.UUID;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

/**
 * Compte de l'appelant, lu dans le `sub` du jeton validé, jamais dans l'URL ni dans le corps. Sert à renseigner
 * `downloads.requested_by` et l'acquittement du rappel des droits. Le décodeur refuse déjà un jeton dont le `sub`
 * n'est pas un UUID : ici, la conversion ne peut pas échouer sur un jeton accepté.
 */
@Component
public class CurrentAccount {

    public UUID accountId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof Jwt jwt) {
            return UUID.fromString(jwt.getSubject());
        }
        throw new IllegalStateException("Aucun jeton authentifié : cette méthode ne doit être appelée que sur une route protégée");
    }
}
