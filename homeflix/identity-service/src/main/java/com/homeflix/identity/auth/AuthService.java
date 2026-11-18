package com.homeflix.identity.auth;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.homeflix.identity.account.Account;
import com.homeflix.identity.account.AccountRepository;
import com.homeflix.identity.account.RefreshToken;
import com.homeflix.identity.account.RefreshTokenRepository;
import com.homeflix.identity.error.ApiException;
import com.homeflix.identity.security.JwtProperties;
import com.homeflix.identity.security.JwtService;

/** Connexion : vérifie les identifiants, émet l'access token et ouvre une session de refresh. */
@Service
public class AuthService {

    /** Résultat d'une connexion : la réponse JSON et la valeur du refresh token à poser en cookie. */
    public record Session(TokenResponse tokens, String refreshToken) {
    }

    private final AccountRepository accounts;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder encoder;
    private final JwtService jwt;
    private final JwtProperties jwtProps;
    private final AuthProperties props;
    private final Clock clock;
    /** Haché une fois : sert à dépenser le même temps de calcul quand le compte n'existe pas. */
    private final String dummyHash;

    public AuthService(AccountRepository accounts, RefreshTokenRepository refreshTokens, PasswordEncoder encoder,
            JwtService jwt, JwtProperties jwtProps, AuthProperties props, Clock clock) {
        this.accounts = accounts;
        this.refreshTokens = refreshTokens;
        this.encoder = encoder;
        this.jwt = jwt;
        this.jwtProps = jwtProps;
        this.props = props;
        this.clock = clock;
        this.dummyHash = encoder.encode("compte-inexistant");
    }

    @Transactional
    public Session login(LoginRequest request) {
        Account account = accounts.findByUsername(request.username().trim()).orElse(null);
        // Même coût et même message que le compte existe ou non : pas d'énumération des comptes.
        boolean passwordOk = encoder.matches(request.password(), account == null ? dummyHash : account.getPasswordHash());
        if (account == null || !passwordOk) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID_CREDENTIALS", "Identifiants incorrects",
                "Identifiant ou mot de passe incorrect.");
        }
        if (!account.isEnabled()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "ACCOUNT_DISABLED", "Compte désactivé",
                "Ce compte est désactivé.");
        }
        return openSession(account, UUID.randomUUID());
    }

    /**
     * Rotation : le refresh token présenté est révoqué et remplacé. Un jeton déjà révoqué (rejeu) révoque toute
     * sa famille : le vol présumé coupe la session. Les refus ne doivent pas annuler cette révocation, d'où
     * noRollbackFor.
     */
    @Transactional(noRollbackFor = ApiException.class)
    public Session refresh(String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) {
            throw sessionExpired();
        }
        RefreshToken current = refreshTokens.findForUpdateByTokenHash(RefreshTokens.hash(refreshToken)).orElse(null);
        if (current == null) {
            throw sessionExpired();
        }
        Instant now = clock.instant();
        if (current.getRevokedAt() != null) {
            revokeFamily(current.getFamilyId(), now);
            throw sessionExpired();
        }
        if (!current.getExpiresAt().isAfter(now)) {
            current.revoke(now);
            throw sessionExpired();
        }
        Account account = current.getAccount();
        if (!account.isEnabled()) {
            revokeFamily(current.getFamilyId(), now);
            throw new ApiException(HttpStatus.FORBIDDEN, "ACCOUNT_DISABLED", "Compte désactivé",
                "Ce compte est désactivé.");
        }
        current.revoke(now);
        return openSession(account, current.getFamilyId());
    }

    /** Déconnexion idempotente : révoque le jeton présenté (et sa famille) s'il existe. */
    @Transactional
    public void logout(String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) {
            return;
        }
        refreshTokens.findForUpdateByTokenHash(RefreshTokens.hash(refreshToken))
            .ifPresent(t -> revokeFamily(t.getFamilyId(), clock.instant()));
    }

    private void revokeFamily(UUID familyId, Instant now) {
        refreshTokens.findByFamilyId(familyId).stream()
            .filter(t -> t.getRevokedAt() == null)
            .forEach(t -> t.revoke(now));
    }

    private static ApiException sessionExpired() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "Session expirée",
            "Votre session a expiré. Reconnectez-vous.");
    }

    /** Émet un access token (sans profil actif) et enregistre un nouveau refresh token de la famille donnée. */
    Session openSession(Account account, UUID familyId) {
        String access = jwt.issueAccessToken(account.getId(), List.of(account.getRole().getName()), null);
        String refresh = RefreshTokens.newValue();
        Instant expiresAt = clock.instant().plus(props.refreshTtl());
        refreshTokens.save(new RefreshToken(account, familyId, RefreshTokens.hash(refresh), expiresAt));
        return new Session(TokenResponse.bearer(access, jwtProps.accessTtl().toSeconds()), refresh);
    }
}
