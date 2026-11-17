package com.homeflix.library.root;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Corps de POST /admin/media-roots et /admin/media-roots/validate. */
public record MediaRootInput(
        @NotBlank(message = "Le chemin est obligatoire") @Size(max = 500, message = "500 caractères au maximum") String path,
        @Size(max = 60, message = "60 caractères au maximum") String label) {
}
