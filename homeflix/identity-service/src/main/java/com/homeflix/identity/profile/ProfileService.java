package com.homeflix.identity.profile;

import java.time.Clock;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.homeflix.identity.account.Account;
import com.homeflix.identity.account.AccountRepository;
import com.homeflix.identity.account.Profile;
import com.homeflix.identity.account.ProfileRepository;
import com.homeflix.identity.account.RefreshTokenRepository;
import com.homeflix.identity.auth.TokenResponse;
import com.homeflix.identity.error.ApiException;
import com.homeflix.identity.security.JwtProperties;
import com.homeflix.identity.security.JwtService;

/**
 * Profils d'un compte. Toute lecture ou écriture est restreinte au compte du jeton : un profil d'un autre
 * compte répond 404 (jamais 403), pour ne pas révéler son existence.
 */
@Service
public class ProfileService {

    static final int MAX_PROFILES = 5;

    private final ProfileRepository profiles;
    private final AccountRepository accounts;
    private final JwtService jwt;
    private final JwtProperties jwtProps;
    private final LibraryPurgeClient library;
    private final RefreshTokenRepository refreshTokens;

    private final Clock clock;

    public ProfileService(ProfileRepository profiles, AccountRepository accounts, JwtService jwt,
            JwtProperties jwtProps, LibraryPurgeClient library, RefreshTokenRepository refreshTokens, Clock clock) {
        this.clock = clock;
        this.refreshTokens = refreshTokens;
        this.profiles = profiles;
        this.accounts = accounts;
        this.jwt = jwt;
        this.jwtProps = jwtProps;
        this.library = library;
    }

    @Transactional(readOnly = true)
    public List<ProfileResponse> list(UUID accountId) {
        return profiles.findByAccountIdOrderByCreatedAtAsc(accountId).stream().map(ProfileResponse::from).toList();
    }

    /** Verrou sur le compte : deux créations simultanées ne peuvent pas dépasser la limite. */
    @Transactional
    public ProfileResponse create(UUID accountId, ProfileInput input) {
        Account account = accounts.findForUpdateById(accountId).orElseThrow(ProfileService::notFound);
        if (profiles.countByAccountId(accountId) >= MAX_PROFILES) {
            throw new ApiException(HttpStatus.CONFLICT, "PROFILE_LIMIT_REACHED", "Limite de profils atteinte",
                "Un compte ne peut pas avoir plus de " + MAX_PROFILES + " profils.");
        }
        String name = input.name().trim();
        requireNameAvailable(accountId, name, null);
        return ProfileResponse.from(profiles.saveAndFlush(new Profile(account, name, input.avatar().trim())));
    }

    @Transactional
    public ProfileResponse update(UUID accountId, UUID profileId, ProfilePatch patch) {
        Profile profile = owned(accountId, profileId);
        if (patch.name() != null) {
            String name = patch.name().trim();
            requireNameAvailable(accountId, name, profileId);
            profile.setName(name);
        }
        if (patch.avatar() != null) {
            profile.setAvatar(patch.avatar().trim());
        }
        return ProfileResponse.from(profiles.saveAndFlush(profile));
    }

    /** La purge Library passe avant la suppression : si Library est injoignable, rien n'est supprimé. */
    @Transactional
    public void delete(UUID accountId, UUID profileId) {
        accounts.findForUpdateById(accountId).orElseThrow(ProfileService::notFound);
        Profile profile = owned(accountId, profileId);
        if (profiles.countByAccountId(accountId) <= 1) {
            throw new ApiException(HttpStatus.CONFLICT, "CONFLICT", "Conflit",
                "Le dernier profil d'un compte ne peut pas être supprimé.");
        }
        library.purgeProfile(profileId);
        profiles.delete(profile);
    }

    /**
     * Émet un jeton neuf portant le profil. Comme il prolonge l'accès, le compte doit être actif et la session de
     * refresh encore ouverte : sinon une désactivation ou une déconnexion pourrait être contournée sans limite.
     *
     * @param familyId session de refresh du jeton appelant (claim `fid`), nul pour un jeton sans session
     * @throws ApiException 404 profil inconnu ou d'un autre compte ; 403 ACCOUNT_DISABLED ; 401 SESSION_EXPIRED
     */
    @Transactional
    public TokenResponse select(UUID accountId, UUID profileId, UUID familyId) {
        Profile profile = owned(accountId, profileId);
        Account account = profile.getAccount();
        if (!account.isEnabled()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "ACCOUNT_DISABLED", "Compte désactivé",
                "Ce compte est désactivé.");
        }
        if (familyId == null || !refreshTokens.existsByFamilyIdAndAccountIdAndRevokedAtIsNullAndExpiresAtAfter(
                familyId, accountId, clock.instant())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "Session expirée",
                "Votre session a expiré. Reconnectez-vous.");
        }
        UUID id = profile.getId();
        List<String> roles = List.of(account.getRole().getName());
        // Lecture du compte avant la mise à jour : elle vide le contexte de persistance.
        refreshTokens.setActiveProfile(familyId, id);
        String access = jwt.issueAccessToken(accountId, roles, id, familyId);
        return TokenResponse.bearer(access, jwtProps.accessTtl().toSeconds());
    }

    private Profile owned(UUID accountId, UUID profileId) {
        return profiles.findByIdAndAccountId(profileId, accountId).orElseThrow(ProfileService::notFound);
    }

    private void requireNameAvailable(UUID accountId, String name, UUID exceptProfileId) {
        boolean taken = profiles.findByAccountIdAndName(accountId, name)
            .filter(p -> !p.getId().equals(exceptProfileId)).isPresent();
        if (taken) {
            throw new ApiException(HttpStatus.CONFLICT, "CONFLICT", "Conflit",
                "Un profil porte déjà ce nom dans ce compte.");
        }
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Introuvable", "Profil introuvable.");
    }
}
