package com.homeflix.identity.admin;

import jakarta.validation.constraints.Pattern;

/** Modification partielle : activation/désactivation et/ou changement de rôle. */
public record AccountUpdate(
        Boolean enabled,
        @Pattern(regexp = "USER|ADMIN", message = "USER ou ADMIN") String role) {
}
