package com.homeflix.identity.profile;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Création d'un profil : nom et avatar (couleur ou emoji prédéfini). */
public record ProfileInput(
        @NotBlank @Size(max = 30) String name,
        @NotBlank @Size(max = 30) String avatar) {
}
