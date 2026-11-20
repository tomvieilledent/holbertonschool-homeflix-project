package com.homeflix.identity.profile;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Modification partielle : les champs absents restent inchangés. */
public record ProfilePatch(
        @Size(min = 1, max = 30) @Pattern(regexp = ".*\\S.*", message = "Ne peut pas être vide") String name,
        @Size(min = 1, max = 30) @Pattern(regexp = ".*\\S.*", message = "Ne peut pas être vide") String avatar) {
}
