package com.homeflix.library.viewing;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FavouriteRepository extends JpaRepository<Favourite, FavouriteId> {

    List<Favourite> findByIdProfileId(UUID profileId);

    /** Ajout idempotent, sûr en cas de requêtes simultanées : la clé (profil, média) arbitre. */
    @Modifying
    @Query(value = """
        INSERT INTO favourites (account_id, profile_id, media_id, added_at)
        VALUES (:accountId, :profileId, :mediaId, now())
        ON CONFLICT (profile_id, media_id) DO NOTHING""", nativeQuery = true)
    int addIfAbsent(@Param("accountId") UUID accountId, @Param("profileId") UUID profileId,
            @Param("mediaId") UUID mediaId);

    @Modifying
    @Query("delete from Favourite f where f.id.profileId = :profileId and f.id.mediaId = :mediaId")
    int remove(@Param("profileId") UUID profileId, @Param("mediaId") UUID mediaId);
}
