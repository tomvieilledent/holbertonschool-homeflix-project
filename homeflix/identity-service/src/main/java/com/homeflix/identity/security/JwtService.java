package com.homeflix.identity.security;

import java.time.Instant;
import java.util.Collection;
import java.util.Date;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

/** Émission des access tokens RS256 (claims : sub, roles, pid optionnel, iss, iat, exp ; kid en en-tête). */
@Service
public class JwtService {

    private final SigningKeyProvider keys;
    private final JwtProperties props;

    public JwtService(SigningKeyProvider keys, JwtProperties props) {
        this.keys = keys;
        this.props = props;
    }

    public String issueAccessToken(UUID accountId, Collection<String> roles, UUID profileId) {
        Instant now = Instant.now();
        JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder()
            .subject(accountId.toString())
            .issuer(props.issuer())
            .issueTime(Date.from(now))
            .expirationTime(Date.from(now.plus(props.accessTtl())))
            .claim("roles", roles.stream().toList());
        if (profileId != null) {
            claims.claim("pid", profileId.toString());
        }
        try {
            SignedJWT jwt = new SignedJWT(
                new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(keys.signingKey().getKeyID()).build(),
                claims.build());
            jwt.sign(new RSASSASigner(keys.signingKey()));
            return jwt.serialize();
        } catch (JOSEException e) {
            throw new IllegalStateException("Signature du jeton impossible", e);
        }
    }
}
