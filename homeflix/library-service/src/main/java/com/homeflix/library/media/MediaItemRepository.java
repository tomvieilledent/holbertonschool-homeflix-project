package com.homeflix.library.media;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface MediaItemRepository extends JpaRepository<MediaItem, UUID> {

    /** Retrouve un fichier déjà indexé : base de l'indexation idempotente. */
    Optional<MediaItem> findByRootIdAndRelativePath(UUID rootId, String relativePath);

    /** Candidats pour reconnaître un fichier déplacé ou renommé. */
    List<MediaItem> findByFingerprint(String fingerprint);

    List<MediaItem> findByRootId(UUID rootId);
}
