package com.homeflix.library.poster;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Adresses d'affiches signées. Une balise `<img>` ne peut pas envoyer l'en-tête `Authorization` : l'adresse porte une
 * signature HMAC liée à un média et à une échéance. L'échéance est arrondie au jour, pour que le navigateur garde
 * l'image en cache d'une page à l'autre.
 */
@Component
public class PosterLinks {

    private static final String PATH = "/api/library/v1/posters/";

    private final byte[] key;
    private final Clock clock;

    public PosterLinks(@Value("${library.stream.ticket-secret:}") String secret, Clock clock) {
        this.clock = clock;
        byte[] material = secret == null ? new byte[0] : secret.getBytes(StandardCharsets.UTF_8);
        if (material.length == 0) {
            material = new byte[32];
            new SecureRandom().nextBytes(material);
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update("poster|".getBytes(StandardCharsets.UTF_8)); // clé distincte de celle des tickets de lecture
            this.key = digest.digest(material);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    public String url(UUID mediaId) {
        long expires = clock.instant().truncatedTo(ChronoUnit.DAYS).plus(Duration.ofDays(2)).getEpochSecond();
        return PATH + mediaId + "?e=" + expires + "&s=" + sign(mediaId, expires);
    }

    /** Vrai si la signature correspond à ce média et à cette échéance, et que celle-ci n'est pas passée. */
    public boolean isValid(UUID mediaId, long expires, String signature) {
        return signature != null && expires > clock.instant().getEpochSecond()
                && MessageDigest.isEqual(sign(mediaId, expires).getBytes(StandardCharsets.US_ASCII),
                        signature.getBytes(StandardCharsets.US_ASCII));
    }

    private String sign(UUID mediaId, long expires) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(mac.doFinal((mediaId + "|" + expires).getBytes(StandardCharsets.US_ASCII)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
