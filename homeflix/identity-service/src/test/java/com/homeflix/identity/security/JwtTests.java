package com.homeflix.identity.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jwt.SignedJWT;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class JwtTests {

    @Autowired JwtService jwtService;
    @Autowired SigningKeyProvider keys;
    @Autowired JwtDecoder decoder;
    @Autowired MockMvc mvc;

    @Test
    void tokenIsVerifiableWithPublicJwksKey() throws Exception {
        UUID account = UUID.randomUUID();
        UUID profile = UUID.randomUUID();
        String token = jwtService.issueAccessToken(account, List.of("USER"), profile);

        SignedJWT parsed = SignedJWT.parse(token);
        var publicKey = keys.publicJwkSet().getKeyByKeyId(parsed.getHeader().getKeyID());
        assertThat(publicKey).isNotNull();
        assertThat(parsed.verify(new RSASSAVerifier(publicKey.toRSAKey()))).isTrue();

        Jwt jwt = decoder.decode(token);
        assertThat(jwt.getSubject()).isEqualTo(account.toString());
        assertThat(jwt.getClaimAsString("pid")).isEqualTo(profile.toString());
        assertThat(jwt.getClaimAsStringList("roles")).containsExactly("USER");
        assertThat(Duration.between(jwt.getIssuedAt(), jwt.getExpiresAt())).isEqualTo(Duration.ofMinutes(15));
    }

    @Test
    void pidIsOptional() {
        String token = jwtService.issueAccessToken(UUID.randomUUID(), List.of("ADMIN"), null);
        assertThat(decoder.decode(token).hasClaim("pid")).isFalse();
    }

    @Test
    void tamperedTokenIsRejected() {
        String token = jwtService.issueAccessToken(UUID.randomUUID(), List.of("USER"), null);
        String tampered = token.substring(0, token.length() - 4) + "AAAA";
        assertThatThrownBy(() -> decoder.decode(tampered)).isInstanceOf(Exception.class);
    }

    @Test
    void jwksPublishesOnlyPublicKey() throws Exception {
        mvc.perform(get("/.well-known/jwks.json"))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", Matchers.containsString("max-age")))
            .andExpect(jsonPath("$.keys[0].kty").value("RSA"))
            .andExpect(jsonPath("$.keys[0].alg").value("RS256"))
            .andExpect(jsonPath("$.keys[0].kid").exists())
            .andExpect(jsonPath("$.keys[0].n").exists())
            .andExpect(jsonPath("$.keys[0].d").doesNotExist())
            .andExpect(jsonPath("$.keys[0].p").doesNotExist())
            .andExpect(jsonPath("$.keys[0].q").doesNotExist());
    }

    @Test
    void bearerTokenAuthenticatesAndRolesAreEnforced() throws Exception {
        String user = jwtService.issueAccessToken(UUID.randomUUID(), List.of("USER"), null);
        String admin = jwtService.issueAccessToken(UUID.randomUUID(), List.of("ADMIN"), null);
        mvc.perform(get("/api/v1/admin/accounts").header("Authorization", "Bearer " + user))
            .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/accounts").header("Authorization", "Bearer " + admin))
            .andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/profiles").header("Authorization", "Bearer garbage"))
            .andExpect(status().isUnauthorized());
    }
}
