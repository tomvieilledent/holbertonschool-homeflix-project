package com.homeflix.identity.admin;

import com.homeflix.identity.security.StrongPassword;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record AccountCreate(
        @NotBlank @Size(min = 3, max = 40) @Pattern(regexp = "[A-Za-z0-9._-]+",
                message = "Lettres, chiffres, point, tiret et underscore uniquement") String username,
        @NotBlank @Email @Size(max = 254) String email,
        @StrongPassword String password,
        @NotBlank @Pattern(regexp = "USER|ADMIN", message = "USER ou ADMIN") String role) {
}
