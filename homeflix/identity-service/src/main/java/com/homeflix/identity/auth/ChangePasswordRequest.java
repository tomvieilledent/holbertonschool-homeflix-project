package com.homeflix.identity.auth;

import com.homeflix.identity.security.StrongPassword;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangePasswordRequest(
        @NotBlank @Size(max = 128) String currentPassword,
        @StrongPassword String newPassword) {
}
