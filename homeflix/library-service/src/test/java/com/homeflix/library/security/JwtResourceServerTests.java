package com.homeflix.library.security;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.homeflix.library.media.MediaItemRepository;
import com.homeflix.library.media.MediaMetadataRepository;
import com.homeflix.library.media.MediaRootRepository;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;

/**
 * Library valide les jetons d'Identity avec un vrai JWKS servi en HTTP (serveur local) : signature,
 * expiration, émetteur, rotation de clé (kid inconnu), rôles et profil actif.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(JwtResourceServerTests.ProbeController.class)
class JwtResourceServerTests {

    private static final String ISSUER = "homeflix-identity";
    private static final AtomicReference<JWKSet> PUBLISHED = new AtomicReference<>();
    private static final RSAKey KEY_A = newKey("key-a");
    private static final RSAKey KEY_B = newKey("key-b");
    private static HttpServer jwksServer;

    @MockitoBean MediaRootRepository mediaRootRepository;

    @MockitoBean com.homeflix.library.catalogue.MediaCatalogueRepository mediaCatalogueRepository;
    @MockitoBean MediaItemRepository mediaItemRepository;
    @MockitoBean com.homeflix.library.viewing.ProgressRepository progressRepository;
    @MockitoBean MediaMetadataRepository mediaMetadataRepository;

    @Autowired MockMvc mvc;

    @TestConfiguration
    @RestController
    static class ProbeController {
        @Autowired CurrentProfile currentProfile;

        @GetMapping("/api/v1/probe/profile")
        String profile() {
            return currentProfile.profileId().toString();
        }

        @GetMapping("/api/v1/probe/account")
        String account() {
            return currentProfile.accountId().toString();
        }
    }

    @BeforeAll
    static void startJwksServer() throws IOException {
        PUBLISHED.set(new JWKSet(KEY_A.toPublicJWK()));
        jwksServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        jwksServer.createContext("/.well-known/jwks.json", exchange -> {
            byte[] body = PUBLISHED.get().toString().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        jwksServer.start();
    }

    @AfterAll
    static void stopJwksServer() {
        jwksServer.stop(0);
    }

    @DynamicPropertySource
    static void jwks(DynamicPropertyRegistry registry) throws IOException {
        // Le serveur doit exister avant le contexte : on le démarre ici si besoin.
        if (jwksServer == null) {
            startJwksServer();
        }
        registry.add("identity.jwks-uri",
            () -> "http://127.0.0.1:" + jwksServer.getAddress().getPort() + "/.well-known/jwks.json");
    }

    private static RSAKey newKey(String kid) {
        try {
            KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
            gen.initialize(2048);
            var pair = gen.generateKeyPair();
            return new RSAKey.Builder((RSAPublicKey) pair.getPublic()).privateKey((RSAPrivateKey) pair.getPrivate())
                .keyID(kid).build();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String token(RSAKey key, String issuer, Instant expiresAt, List<String> roles, UUID pid) throws Exception {
        JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder().subject(UUID.randomUUID().toString())
            .issuer(issuer).issueTime(new Date()).expirationTime(Date.from(expiresAt)).claim("roles", roles);
        if (pid != null) {
            claims.claim("pid", pid.toString());
        }
        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.getKeyID()).build(), claims.build());
        jwt.sign(new RSASSASigner(key));
        return jwt.serialize();
    }

    private static String valid(RSAKey key, List<String> roles, UUID pid) throws Exception {
        return token(key, ISSUER, Instant.now().plusSeconds(600), roles, pid);
    }

    @Test
    void validTokenIsAcceptedAndExposesTheActiveProfile() throws Exception {
        UUID pid = UUID.randomUUID();
        mvc.perform(get("/api/v1/probe/profile").header("Authorization", "Bearer " + valid(KEY_A, List.of("USER"), pid)))
            .andExpect(status().isOk()).andExpect(content().string(pid.toString()));
    }

    @Test
    void missingTokenExpiredTokenBadIssuerAndGarbageGet401ProblemJson() throws Exception {
        mvc.perform(get("/api/v1/probe/account")).andExpect(status().isUnauthorized())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.code").value("SESSION_EXPIRED"));
        String expired = token(KEY_A, ISSUER, Instant.now().minusSeconds(300), List.of("USER"), null);
        mvc.perform(get("/api/v1/probe/account").header("Authorization", "Bearer " + expired))
            .andExpect(status().isUnauthorized());
        String badIssuer = token(KEY_A, "autre-emetteur", Instant.now().plusSeconds(600), List.of("USER"), null);
        mvc.perform(get("/api/v1/probe/account").header("Authorization", "Bearer " + badIssuer))
            .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/probe/account").header("Authorization", "Bearer garbage"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void tokenSignedByAnUnpublishedKeyIsRejected() throws Exception {
        RSAKey rogue = newKey("key-a"); // même kid, autre clé : la signature ne correspond pas
        mvc.perform(get("/api/v1/probe/account").header("Authorization", "Bearer " + valid(rogue, List.of("USER"), null)))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void routeBoundToTheProfileGets409WithoutPid() throws Exception {
        mvc.perform(get("/api/v1/probe/profile").header("Authorization", "Bearer " + valid(KEY_A, List.of("USER"), null)))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("PROFILE_NOT_SELECTED"));
    }

    @Test
    void adminRoutesRequireTheAdminRole() throws Exception {
        mvc.perform(get("/api/v1/admin/anything").header("Authorization", "Bearer " + valid(KEY_A, List.of("USER"), null)))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
        mvc.perform(get("/api/v1/admin/anything").header("Authorization", "Bearer " + valid(KEY_A, List.of("ADMIN"), null)))
            .andExpect(status().isNotFound());
    }

    @Test
    void unknownKidTriggersAJwksRefreshAfterRotation() throws Exception {
        String before = valid(KEY_A, List.of("USER"), null);
        mvc.perform(get("/api/v1/probe/account").header("Authorization", "Bearer " + before)).andExpect(status().isOk());
        // Rotation : Identity publie désormais la clé B (en plus de A) ; un jeton signé par B doit passer.
        PUBLISHED.set(new JWKSet(List.of(KEY_A.toPublicJWK(), KEY_B.toPublicJWK())));
        mvc.perform(get("/api/v1/probe/account").header("Authorization", "Bearer " + valid(KEY_B, List.of("USER"), null)))
            .andExpect(status().isOk());
        PUBLISHED.set(new JWKSet(KEY_A.toPublicJWK()));
    }
}
