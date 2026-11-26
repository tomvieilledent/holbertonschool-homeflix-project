package com.homeflix.library.media;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface MediaRootRepository extends JpaRepository<MediaRoot, UUID> {

    /** Dossiers actifs (non retirés), du plus ancien au plus récent. */
    List<MediaRoot> findByRemovedFalseOrderByCreatedAtAsc();

    Optional<MediaRoot> findByIdAndRemovedFalse(UUID id);

    Optional<MediaRoot> findByPathAndRemovedFalse(String path);

    /** Dernier dossier créé puis retiré à ce chemin (une ancienne base peut en avoir plusieurs). */
    Optional<MediaRoot> findFirstByPathAndRemovedTrueOrderByCreatedAtDesc(String path);
}
