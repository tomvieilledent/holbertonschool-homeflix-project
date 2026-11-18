package com.homeflix.acquisition.security;

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
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.homeflix.acquisition.config.ProblemAccessDeniedHandler;
import com.homeflix.acquisition.config.ProblemAuthenticationEntryPoint;
import com.homeflix.acquisition.config.SecurityConfig;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;

/**
 * Acquisition valide les jetons d'Identity avec un vrai JWKS servi en HTTP (serveur local) : signature,
 * expiration, émetteur, sujet, rotation de clé et rôles. Tranche web uniquement : ces tests ne dépendent ni de la
 * base ni des repositories, donc de l'ordre de fusion avec les autres travaux sur Acquisition.
 */
@WebMvcTest(controllers = JwtResourceServerTests.ProbeController.class)
@Import({ SecurityConfig.class, ProblemAuthenticationEntryPoint.class, ProblemAccessDeniedHandler.class,
        CurrentAccount.class, JwtResourceServerTests.ProbeController.class })
class JwtResourceServerTests {

    private static final String ISSUER = "homeflix-identity";
    private static final AtomicReference<JWKSet> PUBLISHED = new AtomicReference<>();
    private static final RSAKey KEY_A = newKey("key-a");
    private static final RSAKey KEY_B = newKey("key-b");
    private static HttpServer jwksServer;

    @Autowired MockMvc mvc;

    @TestConfiguration
    @RestController
    static class ProbeController {
        @Autowired CurrentAccount currentAccount;

        @GetMapping("/api/v1/probe/account")
        String account() {
            return currentAccount.accountId().toString();
        }

        @GetMapping("/other/route")
        String other() {
            return "ok";
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

    private static String token(RSAKey key, String issuer, String subject, Instant expiresAt, List<String> roles)
            throws Exception {
        JWTClaimsSet claims = new JWTClaimsSet.Builder().subject(subject).issuer(issuer).issueTime(new Date())
            .expirationTime(Date.from(expiresAt)).claim("roles", roles).build();
        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.getKeyID()).build(), claims);
        jwt.sign(new RSASSASigner(key));
        return jwt.serialize();
    }

    private static String valid(RSAKey key, UUID account, List<String> roles) throws Exception {
        return token(key, ISSUER, account.toString(), Instant.now().plusSeconds(600), roles);
    }

    private static String bearer(String token) {
        return "Bearer " + token;
    }

    // --- Authentification ----------------------------------------------------------------------

    @Test
    void anAdminTokenIsAcceptedAndExposesTheAccountFromTheSubject() throws Exception {
        UUID account = UUID.randomUUID();
        mvc.perform(get("/api/v1/probe/account").header("Authorization", bearer(valid(KEY_A, account, List.of("ADMIN")))))
            .andExpect(status().isOk())
            .andExpect(content().string(account.toString()));
    }

    @Test
    void missingTokenGets401ProblemJson() throws Exception {
        mvc.perform(get("/api/v1/probe/account"))
            .andExpect(status().isUnauthorized())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.code").value("SESSION_EXPIRED"))
            .andExpect(jsonPath("$.status").value(401));
    }

    @Test
    void expiredTokenWrongIssuerAndGarbageGet401() throws Exception {
        String expired = token(KEY_A, ISSUER, UUID.randomUUID().toString(), Instant.now().minusSeconds(300), List.of("ADMIN"));
        mvc.perform(get("/api/v1/probe/account").header("Authorization", bearer(expired))).andExpect(status().isUnauthorized());

        String badIssuer = token(KEY_A, "autre-emetteur", UUID.randomUUID().toString(), Instant.now().plusSeconds(600), List.of("ADMIN"));
        mvc.perform(get("/api/v1/probe/account").header("Authorization", bearer(badIssuer))).andExpect(status().isUnauthorized());

        mvc.perform(get("/api/v1/probe/account").header("Authorization", "Bearer garbage")).andExpect(status().isUnauthorized());
    }

    @Test
    void tokenSignedByAnUnpublishedKeyIsRejected() throws Exception {
        RSAKey rogue = newKey("key-a"); // même kid, autre clé : la signature ne correspond pas
        mvc.perform(get("/api/v1/probe/account").header("Authorization", bearer(valid(rogue, UUID.randomUUID(), List.of("ADMIN")))))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void aSubjectThatIsNotAnAccountIdIsRejectedAs401NotAsAServerError() throws Exception {
        String notAUuid = token(KEY_A, ISSUER, "pas-un-uuid", Instant.now().plusSeconds(600), List.of("ADMIN"));
        mvc.perform(get("/api/v1/probe/account").header("Authorization", bearer(notAUuid)))
            .andExpect(status().isUnauthorized());
    }

    // --- Autorisation --------------------------------------------------------------------------

    @Test
    void anOrdinaryUserGets403ProblemJsonOnTheApi() throws Exception {
        mvc.perform(get("/api/v1/probe/account").header("Authorization", bearer(valid(KEY_A, UUID.randomUUID(), List.of("USER")))))
            .andExpect(status().isForbidden())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }

    @Test
    void aTokenWithoutRolesGets403OnTheApi() throws Exception {
        mvc.perform(get("/api/v1/probe/account").header("Authorization", bearer(valid(KEY_A, UUID.randomUUID(), List.of()))))
            .andExpect(status().isForbidden());
    }

    @Test
    void routesOutsideTheApiOnlyNeedAnAuthenticatedUser() throws Exception {
        mvc.perform(get("/other/route")).andExpect(status().isUnauthorized());
        mvc.perform(get("/other/route").header("Authorization", bearer(valid(KEY_A, UUID.randomUUID(), List.of("USER")))))
            .andExpect(status().isOk());
    }

    // --- Rotation de clé -----------------------------------------------------------------------

    @Test
    void unknownKidTriggersAJwksRefreshAfterRotation() throws Exception {
        mvc.perform(get("/api/v1/probe/account").header("Authorization", bearer(valid(KEY_A, UUID.randomUUID(), List.of("ADMIN")))))
            .andExpect(status().isOk());
        // Rotation : Identity publie désormais la clé B (en plus de A) ; un jeton signé par B doit passer.
        PUBLISHED.set(new JWKSet(List.of(KEY_A.toPublicJWK(), KEY_B.toPublicJWK())));
        mvc.perform(get("/api/v1/probe/account").header("Authorization", bearer(valid(KEY_B, UUID.randomUUID(), List.of("ADMIN")))))
            .andExpect(status().isOk());
        PUBLISHED.set(new JWKSet(KEY_A.toPublicJWK()));
    }
}
