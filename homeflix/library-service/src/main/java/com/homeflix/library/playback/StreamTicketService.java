package com.homeflix.library.playback;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.text.ParseException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.homeflix.library.api.ApiException;
import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

/**
 * Tickets de streaming : JWT court (HS256, audience « stream ») lié au compte, au profil actif et à un seul
 * média. Signé avec un secret propre à Library (STREAM_TICKET_SECRET), sans dépendance à Identity.
 * Les tickets ne sont jamais journalisés.
 */
@Service
public class StreamTicketService {

    private static final Logger log = LoggerFactory.getLogger(StreamTicketService.class);

    static final String AUDIENCE = "stream";
    static final String ISSUER = "homeflix-library";
    static final Duration TTL = Duration.ofHours(2);

    public record Ticket(String token, Instant expiresAt) {
    }

    private final byte[] key;
    private final Clock clock;

    public StreamTicketService(@Value("${library.stream.ticket-secret:}") String secret, Clock clock) {
        this.clock = clock;
        byte[] material;
        if (secret == null || secret.isBlank()) {
            // Secret aléatoire propre à ce processus : sûr, mais les tickets ne survivent pas à un redémarrage.
            log.warn("STREAM_TICKET_SECRET absent : secret éphémère généré (les tickets expirent au redémarrage)");
            material = new byte[32];
            new SecureRandom().nextBytes(material);
        } else {
            material = secret.getBytes(StandardCharsets.UTF_8);
        }
        this.key = sha256(material); // 32 octets quelle que soit la longueur du secret fourni
    }

    public Ticket issue(UUID accountId, UUID profileId, UUID mediaId) {
        Instant now = clock.instant();
        Instant expiresAt = now.plus(TTL);
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
            .issuer(ISSUER)
            .audience(AUDIENCE)
            .subject(accountId.toString())
            .claim("pid", profileId.toString())
            .claim("mediaId", mediaId.toString())
            .issueTime(Date.from(now))
            .expirationTime(Date.from(expiresAt))
            .build();
        try {
            SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
            jwt.sign(new MACSigner(key));
            return new Ticket(jwt.serialize(), expiresAt);
        } catch (JOSEException e) {
            throw new IllegalStateException("Signature du ticket impossible", e);
        }
    }

    /**
     * Vérifie un ticket pour un média donné.
     *
     * @throws ApiException 403 sans ticket, falsifié, d'une autre audience ou d'un autre média ; 401
     *                      TICKET_EXPIRED si le ticket est expiré
     */
    public JWTClaimsSet verify(String token, UUID mediaId) {
        if (token == null || token.isBlank()) {
            throw denied();
        }
        try {
            SignedJWT jwt = SignedJWT.parse(token);
            if (!JWSAlgorithm.HS256.equals(jwt.getHeader().getAlgorithm()) || !jwt.verify(new MACVerifier(key))) {
                throw denied();
            }
            JWTClaimsSet claims = jwt.getJWTClaimsSet();
            if (!ISSUER.equals(claims.getIssuer()) || !List.of(AUDIENCE).equals(claims.getAudience())
                    || !mediaId.toString().equals(claims.getStringClaim("mediaId"))) {
                throw denied();
            }
            Date exp = claims.getExpirationTime();
            if (exp == null || !exp.toInstant().isAfter(clock.instant())) {
                throw new ApiException(HttpStatus.UNAUTHORIZED, "TICKET_EXPIRED", "Ticket expiré",
                    "Le ticket de lecture a expiré. Relancez la lecture.");
            }
            return claims;
        } catch (ParseException | JOSEException e) {
            throw denied();
        }
    }

    private static ApiException denied() {
        return new ApiException(HttpStatus.FORBIDDEN, "ACCESS_DENIED", "Accès refusé",
            "Ticket de lecture absent ou invalide pour ce média.");
    }

    private static byte[] sha256(byte[] data) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(data);
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
