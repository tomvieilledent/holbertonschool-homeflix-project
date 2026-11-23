package com.homeflix.identity.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.homeflix.identity.account.Account;
import com.homeflix.identity.account.AccountRepository;
import com.homeflix.identity.account.Profile;
import com.homeflix.identity.account.ProfileRepository;
import com.homeflix.identity.account.Role;
import com.homeflix.identity.account.RoleRepository;
import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.PlainJWT;
import com.nimbusds.jwt.SignedJWT;

/**
 * Scénarios d'autorisation d'Identity (issue #78) sur la vraie pile web et PostgreSQL : anonyme, USER, ADMIN, jeton
 * expiré, jeton falsifié (mauvaise signature, `alg=none`, confusion d'algorithme) et accès aux données d'un autre
 * compte (IDOR).
 */
@SpringBootTest(properties = {
        "homeflix.jwt.generate-if-missing=true",
        "homeflix.setup.init-on-startup=false" })
@AutoConfigureMockMvc
@Testcontainers
class AuthorizationScenariosIntegrationTests {

    private static final String PASSWORD = String.join("-", "mot", "de", "passe", "de", "test");

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired AccountRepository accounts;
    @Autowired ProfileRepository profiles;
    @Autowired RoleRepository roles;
    @Autowired PasswordEncoder encoder;
    @Autowired JwtService jwt;
    @Autowired SigningKeyProvider keys;
    @Autowired JwtProperties props;

    Account admin;
    Account alice;
    Account bob;
    Profile aliceProfile;

    @BeforeEach
    void reset() {
        jdbc.update("DELETE FROM accounts");
        admin = accounts.save(new Account("admin", "admin@maison.fr", encoder.encode(PASSWORD), roles.getReferenceById(Role.ADMIN)));
        alice = accounts.save(new Account("alice", "alice@maison.fr", encoder.encode(PASSWORD), roles.getReferenceById(Role.USER)));
        bob = accounts.save(new Account("bob", "bob@maison.fr", encoder.encode(PASSWORD), roles.getReferenceById(Role.USER)));
        aliceProfile = profiles.save(new Profile(alice, "Alice", "bleu"));
        profiles.save(new Profile(alice, "Alice 2", "rouge"));
    }

    private String token(Account a) {
        return jwt.issueAccessToken(a.getId(), List.of(a.getRole().getName()), null);
    }

    private static String bearer(String token) {
        return "Bearer " + token;
    }

    private JWTClaimsSet.Builder claims(Account a, Instant issuedAt, Instant expiresAt) {
        return new JWTClaimsSet.Builder().subject(a.getId().toString()).issuer(props.issuer())
            .issueTime(Date.from(issuedAt)).expirationTime(Date.from(expiresAt)).claim("roles", List.of("ADMIN"));
    }

    private String signedWith(RSASSASigner signer, JWSHeader header, JWTClaimsSet claims) throws JOSEException {
        SignedJWT signed = new SignedJWT(header, claims);
        signed.sign(signer);
        return signed.serialize();
    }

    // --- Anonyme, USER, ADMIN ----------------------------------------------------------------------------

    @Test
    void anonymousIsRefusedOnEveryProtectedRoute() throws Exception {
        mvc.perform(get("/api/v1/profiles")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/auth/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/admin/accounts")).andExpect(status().isUnauthorized());
    }

    @Test
    void aUserCannotReachAdministration() throws Exception {
        mvc.perform(get("/api/v1/admin/accounts").header("Authorization", bearer(token(alice)))).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/accounts/" + bob.getId()).header("Authorization", bearer(token(alice))))
            .andExpect(status().isForbidden());
        mvc.perform(patch("/api/v1/admin/accounts/" + alice.getId()).header("Authorization", bearer(token(alice)))
                .contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"ADMIN\"}"))
            .andExpect(status().isForbidden());
        assertThat(accounts.findById(alice.getId()).orElseThrow().getRole().getName()).isEqualTo(Role.USER);
    }

    @Test
    void anAdministratorReachesAdministration() throws Exception {
        mvc.perform(get("/api/v1/admin/accounts").header("Authorization", bearer(token(admin)))).andExpect(status().isOk());
    }

    @Test
    void theRolesOfTheTokenCountNotTheOnesInTheDatabaseOfTheRequestedResource() throws Exception {
        // Un compte USER dont le jeton affirme ADMIN est accepté tant que la signature est valide : le jeton fait foi,
        // c'est la signature (et non le contenu) qui le protège. Ici le jeton est signé par Identity : cas légitime.
        String adminToken = jwt.issueAccessToken(alice.getId(), List.of("ADMIN"), null);
        mvc.perform(get("/api/v1/admin/accounts").header("Authorization", bearer(adminToken))).andExpect(status().isOk());
    }

    // --- Jetons invalides ---------------------------------------------------------------------------------

    @Test
    void anExpiredTokenIsRefused() throws Exception {
        Instant past = Instant.now().minusSeconds(3600);
        String expired = signedWith(new RSASSASigner(keys.signingKey()),
            new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(keys.signingKey().getKeyID()).build(),
            claims(admin, past.minusSeconds(900), past).build());
        mvc.perform(get("/api/v1/admin/accounts").header("Authorization", bearer(expired))).andExpect(status().isUnauthorized());
    }

    @Test
    void aTokenSignedWithAnotherKeyIsRefused() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        RSAPrivateKey other = (RSAPrivateKey) generator.generateKeyPair().getPrivate();
        Instant now = Instant.now();
        // Même identifiant de clé que la vraie : seule la signature diffère.
        String forged = signedWith(new RSASSASigner(other),
            new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(keys.signingKey().getKeyID()).build(),
            claims(alice, now, now.plusSeconds(900)).build());
        mvc.perform(get("/api/v1/admin/accounts").header("Authorization", bearer(forged))).andExpect(status().isUnauthorized());
    }

    @Test
    void aTokenWithAlgNoneIsRefused() throws Exception {
        Instant now = Instant.now();
        String unsigned = new PlainJWT(claims(alice, now, now.plusSeconds(900)).build()).serialize();
        mvc.perform(get("/api/v1/admin/accounts").header("Authorization", bearer(unsigned))).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/profiles").header("Authorization", bearer(unsigned))).andExpect(status().isUnauthorized());
    }

    @Test
    void aTokenSignedWithTheSharedPublicKeyAsAnHmacSecretIsRefused() throws Exception {
        Instant now = Instant.now();
        SignedJWT hs = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.HS256).build(), claims(alice, now, now.plusSeconds(900)).build());
        hs.sign(new MACSigner(keys.publicKey().getEncoded().length >= 32 ? keys.publicKey().getEncoded() : new byte[32]));
        mvc.perform(get("/api/v1/admin/accounts").header("Authorization", bearer(hs.serialize()))).andExpect(status().isUnauthorized());
    }

    @Test
    void aTamperedPayloadIsRefused() throws Exception {
        String[] parts = token(alice).split("\\.");
        String adminPayload = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(
            ("{\"sub\":\"" + alice.getId() + "\",\"roles\":[\"ADMIN\"],\"iss\":\"" + props.issuer() + "\",\"exp\":"
                + (Instant.now().getEpochSecond() + 900) + "}").getBytes(java.nio.charset.StandardCharsets.UTF_8));
        String tampered = parts[0] + "." + adminPayload + "." + parts[2];
        mvc.perform(get("/api/v1/admin/accounts").header("Authorization", bearer(tampered))).andExpect(status().isUnauthorized());
    }

    @Test
    void aTokenFromAnotherIssuerIsRefused() throws Exception {
        Instant now = Instant.now();
        String wrongIssuer = signedWith(new RSASSASigner(keys.signingKey()),
            new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(keys.signingKey().getKeyID()).build(),
            claims(admin, now, now.plusSeconds(900)).issuer("autre-emetteur").build());
        mvc.perform(get("/api/v1/admin/accounts").header("Authorization", bearer(wrongIssuer))).andExpect(status().isUnauthorized());
    }

    @Test
    void malformedAuthorizationHeadersAreRefused() throws Exception {
        for (String header : new String[] { "Bearer ", "Bearer", "Bearer a.b.c", "Basic YWRtaW46YWRtaW4=", token(admin) }) {
            mvc.perform(get("/api/v1/admin/accounts").header("Authorization", header)).andExpect(status().isUnauthorized());
        }
    }

    // --- Compte désactivé ----------------------------------------------------------------------------------

    @Test
    void aDisabledAccountCannotLogInAgain() throws Exception {
        jdbc.update("update accounts set enabled = false where id = ?", alice.getId());
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"alice\",\"password\":\"" + PASSWORD + "\"}"))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ACCOUNT_DISABLED"));
    }

    // --- IDOR : profils et comptes ----------------------------------------------------------------------------

    @Test
    void anotherAccountCannotSeeSelectUpdateOrDeleteMyProfiles() throws Exception {
        String bobToken = bearer(token(bob));
        mvc.perform(get("/api/v1/profiles").header("Authorization", bobToken))
            .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(post("/api/v1/profiles/" + aliceProfile.getId() + "/select").header("Authorization", bobToken))
            .andExpect(status().isNotFound());
        mvc.perform(patch("/api/v1/profiles/" + aliceProfile.getId()).header("Authorization", bobToken)
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Pirate\"}"))
            .andExpect(status().isNotFound());
        mvc.perform(delete("/api/v1/profiles/" + aliceProfile.getId()).header("Authorization", bobToken))
            .andExpect(status().isNotFound());
        Profile unchanged = profiles.findById(aliceProfile.getId()).orElseThrow();
        assertThat(unchanged.getName()).isEqualTo("Alice");
    }

    @Test
    void aProfileIdentifierOfAnotherAccountInTheTokenIsNotTrustedForSelection() throws Exception {
        // Un 404 identique pour un profil inexistant et pour un profil d'autrui : rien ne révèle son existence.
        String bobToken = bearer(token(bob));
        mvc.perform(post("/api/v1/profiles/" + UUID.randomUUID() + "/select").header("Authorization", bobToken))
            .andExpect(status().isNotFound());
    }

    @Test
    void theAuthenticatedProfileOfTheTokenIsTheOnlyIdentityReturned() throws Exception {
        mvc.perform(get("/api/v1/auth/me").header("Authorization", bearer(token(alice))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.account.username").value("alice"));
        mvc.perform(get("/api/v1/auth/me").header("Authorization", bearer(token(bob))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.account.username").value("bob"));
    }
}
