package com.homeflix.library.root;

import jakarta.validation.constraints.Size;

/** Corps de PATCH /admin/media-roots/{id} : le chemin n'est pas modifiable. */
public record MediaRootPatch(
        @Size(min = 1, max = 60, message = "Entre 1 et 60 caractères") String label,
        Boolean enabled) {

    public boolean isEmpty() {
        return label == null && enabled == null;
    }
}
