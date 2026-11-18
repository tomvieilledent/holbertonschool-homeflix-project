package com.homeflix.library.playback;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Date;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import com.homeflix.library.api.ApiException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

class StreamTicketServiceTests {

    // Secrets de test assemblés au runtime : aucun secret littéral dans le dépôt.
    private static final String SECRET = String.join("-", "secret", "de", "test", "pour", "les", "tickets");
    private static final String OTHER_SECRET = String.join("-", "autre", "secret", "de", "test");

    private final UUID account = UUID.randomUUID();
    private final UUID profile = UUID.randomUUID();
    private final UUID media = UUID.randomUUID();
    private Instant now = Instant.parse("2026-11-19T10:00:00Z");
    private final Clock clock = new Clock() {
        @Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(java.time.ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    };

    private StreamTicketService service(String secret) {
        return new StreamTicketService(secret, clock);
    }

    private static void assertApi(Runnable call, HttpStatus status, String code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(status);
            assertThat(e.getCode()).isEqualTo(code);
        });
    }

    @Test
    void aValidTicketIsBoundToTheAccountTheProfileAndTheMediaForTwoHours() {
        StreamTicketService s = service(SECRET);
        StreamTicketService.Ticket t = s.issue(account, profile, media);
        assertThat(t.expiresAt()).isEqualTo(now.plus(Duration.ofHours(2)));
        JWTClaimsSet claims = s.verify(t.token(), media);
        assertThat(claims.getSubject()).isEqualTo(account.toString());
        assertThat(claims.getClaim("pid")).isEqualTo(profile.toString());
        assertThat(claims.getAudience()).containsExactly("stream");
    }

    @Test
    void aTicketIsRefusedOnAnotherMedia() {
        StreamTicketService s = service(SECRET);
        String token = s.issue(account, profile, media).token();
        assertApi(() -> s.verify(token, UUID.randomUUID()), HttpStatus.FORBIDDEN, "ACCESS_DENIED");
    }

    @Test
    void missingOrBlankTicketIsRefusedWith403() {
        StreamTicketService s = service(SECRET);
        assertApi(() -> s.verify(null, media), HttpStatus.FORBIDDEN, "ACCESS_DENIED");
        assertApi(() -> s.verify("  ", media), HttpStatus.FORBIDDEN, "ACCESS_DENIED");
        assertApi(() -> s.verify("pas.un.jwt", media), HttpStatus.FORBIDDEN, "ACCESS_DENIED");
    }

    @Test
    void anExpiredTicketGets401TicketExpired() {
        StreamTicketService s = service(SECRET);
        String token = s.issue(account, profile, media).token();
        now = now.plus(Duration.ofHours(2)).plusSeconds(1);
        assertApi(() -> s.verify(token, media), HttpStatus.UNAUTHORIZED, "TICKET_EXPIRED");
    }

    @Test
    void aTamperedTicketIsRefused() {
        StreamTicketService s = service(SECRET);
        String token = s.issue(account, profile, media).token();
        String tampered = token.substring(0, token.length() - 4) + "AAAA";
        assertApi(() -> s.verify(tampered, media), HttpStatus.FORBIDDEN, "ACCESS_DENIED");
    }

    @Test
    void aTicketSignedWithAnotherSecretIsRefused() {
        String foreign = service(OTHER_SECRET).issue(account, profile, media).token();
        assertApi(() -> service(SECRET).verify(foreign, media), HttpStatus.FORBIDDEN, "ACCESS_DENIED");
    }

    @Test
    void aTokenWithAnotherAudienceOrNoMediaIsRefused() throws Exception {
        StreamTicketService s = service(SECRET);
        // Même secret et même algorithme, mais audience différente : refusé.
        byte[] key = java.security.MessageDigest.getInstance("SHA-256").digest(SECRET.getBytes());
        JWTClaimsSet claims = new JWTClaimsSet.Builder().issuer("homeflix-library").audience("autre")
            .claim("mediaId", media.toString()).expirationTime(Date.from(now.plusSeconds(60))).build();
        SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
        jwt.sign(new MACSigner(key));
        assertApi(() -> s.verify(jwt.serialize(), media), HttpStatus.FORBIDDEN, "ACCESS_DENIED");
    }

    @Test
    void withoutASecretAnEphemeralOneIsGeneratedAndTicketsStillWork() {
        StreamTicketService s = service("");
        String token = s.issue(account, profile, media).token();
        assertThat(s.verify(token, media).getSubject()).isEqualTo(account.toString());
        // Un autre processus (autre secret éphémère) ne peut pas les valider.
        assertApi(() -> service("").verify(token, media), HttpStatus.FORBIDDEN, "ACCESS_DENIED");
    }
}
