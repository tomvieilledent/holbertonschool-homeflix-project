package com.homeflix.identity.account;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {

    Optional<RefreshToken> findByTokenHash(String tokenHash);

    /** Verrouille la ligne : deux refresh simultanés avec le même jeton sont sérialisés (le second est un rejeu). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from RefreshToken t where t.tokenHash = :hash")
    Optional<RefreshToken> findForUpdateByTokenHash(@Param("hash") String hash);

    List<RefreshToken> findByFamilyId(UUID familyId);

    /** Session encore ouverte : un jeton de la famille, propre au compte, ni révoqué ni expiré. */
    boolean existsByFamilyIdAndAccountIdAndRevokedAtIsNullAndExpiresAtAfter(UUID familyId, UUID accountId,
            Instant now);

    /** Révoque d'un coup toutes les sessions encore valides d'un compte. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update RefreshToken t set t.revokedAt = :now where t.account.id = :accountId and t.revokedAt is null")
    int revokeAllOfAccount(@Param("accountId") UUID accountId, @Param("now") Instant now);

    /** Mémorise le profil actif sur les sessions encore valides de la famille (le prochain refresh le restitue). */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update RefreshToken t set t.activeProfileId = :profileId where t.familyId = :familyId and t.revokedAt is null")
    int setActiveProfile(@Param("familyId") UUID familyId, @Param("profileId") UUID profileId);
}
