package com.homeflix.identity.account;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Confirmation du mot de passe avant une action irréversible (contrat `PasswordConfirmation`). */
public record PasswordConfirmation(@NotBlank @Size(max = 128) String password) {

    /** Jamais le mot de passe dans une trace. */
    @Override
    public String toString() {
        return "PasswordConfirmation[password=***]";
    }
}
