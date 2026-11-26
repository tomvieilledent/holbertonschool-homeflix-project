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
        return issueAccessToken(accountId, roles, profileId, null);
    }

    /** `familyId` (claim `fid`) relie le jeton à sa session de refresh, pour y mémoriser le profil actif. */
    public String issueAccessToken(UUID accountId, Collection<String> roles, UUID profileId, UUID familyId) {
        return issueAccessToken(accountId, roles, profileId, familyId, false);
    }

    /**
     * `mustChangePassword` (claim `mcp`) : mot de passe temporaire. Les services ne donnent alors aucun rôle au
     * jeton : seules `/auth/me`, `/auth/change-password` et la déconnexion restent utilisables.
     */
    public String issueAccessToken(UUID accountId, Collection<String> roles, UUID profileId, UUID familyId,
            boolean mustChangePassword) {
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
        if (mustChangePassword) {
            claims.claim("mcp", true);
        }
        if (familyId != null) {
            claims.claim("fid", familyId.toString());
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
