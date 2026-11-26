package com.homeflix.library.media;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MediaMetadataRepository extends JpaRepository<MediaMetadata, UUID> {

    /** Média non retiré ayant une affiche, avec sa racine (lue hors transaction). */
    @Query("select m from MediaMetadata m join fetch m.media i join fetch i.root "
            + "where m.id = :mediaId and i.deleted = false and m.posterPath is not null")
    Optional<MediaMetadata> findWithRoot(@Param("mediaId") UUID mediaId);
}
