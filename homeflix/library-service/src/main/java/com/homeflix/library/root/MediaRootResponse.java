package com.homeflix.library.root;

import java.time.Instant;
import java.util.UUID;

import com.homeflix.library.media.MediaRoot;

public record MediaRootResponse(UUID id, String path, String label, boolean enabled, Instant createdAt) {

    static MediaRootResponse from(MediaRoot root) {
        return new MediaRootResponse(root.getId(), root.getPath(), root.getLabel(), root.isEnabled(), root.getCreatedAt());
    }
}
