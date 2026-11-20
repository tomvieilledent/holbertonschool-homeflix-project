package com.homeflix.library.internal;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Fichier du dossier de téléchargements, désigné par son chemin relatif (jamais absolu). */
public record DownloadRequest(
        @NotBlank @Size(max = 1000) String relativePath,
        @Size(max = 200) String title) {
}
