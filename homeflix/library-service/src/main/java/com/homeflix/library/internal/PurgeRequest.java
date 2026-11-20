package com.homeflix.library.internal;

import java.util.UUID;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/** Purge des données d'un profil (`PROFILE` + profileId) ou d'un compte entier (`ACCOUNT` + accountId). */
public record PurgeRequest(
        @NotNull @Pattern(regexp = "PROFILE|ACCOUNT", message = "PROFILE ou ACCOUNT") String scope,
        UUID profileId,
        UUID accountId) {

    @AssertTrue(message = "profileId (PROFILE) ou accountId (ACCOUNT) est obligatoire")
    boolean isTargetPresent() {
        return "PROFILE".equals(scope) ? profileId != null : "ACCOUNT".equals(scope) ? accountId != null : true;
    }
}
