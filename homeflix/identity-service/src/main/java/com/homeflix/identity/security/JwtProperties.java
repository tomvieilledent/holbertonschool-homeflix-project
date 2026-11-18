package com.homeflix.identity.security;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param privateKeyBase64  clé privée RSA PKCS#8 (PEM ou DER) encodée en Base64, fournie par l'environnement
 *                          (JWT_PRIVATE_KEY_BASE64), jamais committée
 * @param generateIfMissing génère une clé éphémère si aucune clé n'est fournie (dev et tests uniquement)
 */
@ConfigurationProperties("homeflix.jwt")
public record JwtProperties(String privateKeyBase64, boolean generateIfMissing, String issuer, Duration accessTtl) {

    public JwtProperties {
        if (issuer == null || issuer.isBlank()) {
            issuer = "homeflix-identity";
        }
        if (accessTtl == null) {
            accessTtl = Duration.ofMinutes(15);
        }
    }
}
