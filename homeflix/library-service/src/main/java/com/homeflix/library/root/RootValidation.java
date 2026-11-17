package com.homeflix.library.root;

import com.fasterxml.jackson.annotation.JsonInclude;

/** Résultat de la vérification d'un dossier, avec une explication lisible pour l'administrateur. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record RootValidation(boolean valid, String code, String message) {

    static RootValidation ok() {
        return new RootValidation(true, null, null);
    }

    static RootValidation invalid(String code, String message) {
        return new RootValidation(false, code, message);
    }
}
