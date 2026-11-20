package com.homeflix.library.viewing;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProgressRepository extends JpaRepository<Progress, ProgressId> {

    List<Progress> findByIdProfileId(UUID profileId);

    /** Upsert atomique : deux sauvegardes simultanées ne peuvent pas créer de doublon. */
    @Modifying
    @Query(value = """
        INSERT INTO progress (account_id, profile_id, media_id, position_seconds, duration_seconds, state, updated_at)
        VALUES (:accountId, :profileId, :mediaId, :position, :duration, :state, now())
        ON CONFLICT (profile_id, media_id) DO UPDATE
        SET position_seconds = EXCLUDED.position_seconds, duration_seconds = EXCLUDED.duration_seconds,
            state = EXCLUDED.state, updated_at = now()""", nativeQuery = true)
    int upsert(@Param("accountId") UUID accountId, @Param("profileId") UUID profileId, @Param("mediaId") UUID mediaId,
            @Param("position") int position, @Param("duration") int duration, @Param("state") String state);

    @Modifying
    @Query("delete from Progress p where p.id.profileId = :profileId and p.id.mediaId = :mediaId")
    int remove(@Param("profileId") UUID profileId, @Param("mediaId") UUID mediaId);
}
