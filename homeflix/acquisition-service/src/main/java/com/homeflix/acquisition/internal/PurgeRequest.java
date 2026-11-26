package com.homeflix.acquisition.internal;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;

/** Compte supprimé dont les données doivent disparaître d'Acquisition. */
public record PurgeRequest(@NotNull UUID accountId) {
}
