package com.homeflix.library.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.io.IOException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.time.Duration;
import java.util.Date;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.homeflix.library.media.MediaItemRepository;
import com.homeflix.library.media.MediaMetadataRepository;
import com.homeflix.library.media.MediaRootRepository;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

/**
 * Identity qui accepte la connexion mais ne répond jamais (panne partielle) : la validation d'un jeton doit
 * échouer vite, pas bloquer 30 s (délai par défaut du client JWKS) et saturer les threads de Library.
 *
 * <p>Ce test ne fixe pas le statut final. Quand Identity est injoignable, Spring lève une
 * AuthenticationServiceException : MockMvc la propage telle quelle, alors que sur un vrai serveur la réponse
 * est un 401 SESSION_EXPIRED (constaté sur la pile Docker : 3 s si Identity est gelé, 0,2 s s'il est arrêté).
 * Ce 401 est trompeur (la session n'a pas expiré) ; le bon statut (503 et son code) est une décision de
 * contrat, hors de ce correctif.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class JwksTimeoutTests {

    /** Accepte les connexions (file d'attente du système) sans jamais répondre. */
    private static ServerSocket silentIdentity;

    @MockitoBean MediaRootRepository mediaRootRepository;
    @MockitoBean MediaItemRepository mediaItemRepository;
    @MockitoBean MediaMetadataRepository mediaMetadataRepository;

    @Autowired MockMvc mvc;

    @DynamicPropertySource
    static void silentIdentity(DynamicPropertyRegistry registry) throws IOException {
        silentIdentity = new ServerSocket(0, 50, InetAddress.getLoopbackAddress());
        registry.add("identity.jwks-uri",
            () -> "http://127.0.0.1:" + silentIdentity.getLocalPort() + "/.well-known/jwks.json");
        // identity.jwks-timeout n'est volontairement pas fixé : on teste la valeur par défaut (3 s).
    }

    @AfterAll
    static void close() throws IOException {
        silentIdentity.close();
    }

    @Test
    void silentIdentityMakesTokenValidationFailFast() throws Exception {
        RSAKey unknownKey = new RSAKeyGenerator(2048).keyID("not-published").generate();
        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID("not-published").build(),
            new JWTClaimsSet.Builder().subject("x").issuer("homeflix-identity")
                .expirationTime(new Date(System.currentTimeMillis() + 60_000)).build());
        jwt.sign(new RSASSASigner(unknownKey));

        long start = System.nanoTime();
        boolean rejected;
        try {
            rejected = mvc.perform(get("/api/v1/anything").header("Authorization", "Bearer " + jwt.serialize()))
                .andReturn().getResponse().getStatus() >= 400;
        } catch (Exception identityUnreachable) {
            rejected = true; // AuthenticationServiceException : Identity injoignable (délai dépassé)
        }
        Duration elapsed = Duration.ofNanos(System.nanoTime() - start);

        assertThat(rejected).as("le jeton ne doit pas être accepté").isTrue();
        assertThat(elapsed).as("temps de réponse avec Identity muet").isLessThan(Duration.ofSeconds(10));
    }
}
