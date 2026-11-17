package com.homeflix.library.media;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MediaItemRepository extends JpaRepository<MediaItem, UUID> {

    /** Retrouve un fichier déjà indexé : base de l'indexation idempotente. */
    Optional<MediaItem> findByRootIdAndRelativePath(UUID rootId, String relativePath);

    /** Candidats pour reconnaître un fichier déplacé ou renommé. */
    List<MediaItem> findByFingerprint(String fingerprint);

    List<MediaItem> findByRootId(UUID rootId);

    /** Marque indisponibles tous les médias d'une racine (retrait du dossier : aucun fichier n'est touché). */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update MediaItem i set i.availability = :availability where i.root.id = :rootId")
    int updateAvailabilityByRootId(@Param("rootId") UUID rootId, @Param("availability") Availability availability);
}
