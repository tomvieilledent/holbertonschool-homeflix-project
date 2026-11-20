package com.homeflix.identity.profile;

import java.time.Instant;
import java.util.UUID;

import com.homeflix.identity.account.Profile;

public record ProfileResponse(UUID id, String name, String avatar, Instant createdAt) {

    public static ProfileResponse from(Profile p) {
        return new ProfileResponse(p.getId(), p.getName(), p.getAvatar(), p.getCreatedAt());
    }
}
