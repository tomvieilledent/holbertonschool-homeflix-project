package com.homeflix.identity.auth;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param refreshTtl   durée de vie d'une session de refresh (7 jours par défaut)
 * @param cookieSecure attribut Secure du cookie de refresh : vrai par défaut, désactivé en dev (HTTP local)
 */
@ConfigurationProperties("homeflix.auth")
public record AuthProperties(Duration refreshTtl, boolean cookieSecure) {

    public AuthProperties {
        if (refreshTtl == null) {
            refreshTtl = Duration.ofDays(7);
        }
    }
}
