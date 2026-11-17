package com.homeflix.library.media;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface MediaMetadataRepository extends JpaRepository<MediaMetadata, UUID> {
}
