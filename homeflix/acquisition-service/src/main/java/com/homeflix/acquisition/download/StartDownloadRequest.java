package com.homeflix.acquisition.download;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;

/** Seule entrée possible : l'identifiant d'une entrée du catalogue autorisé. Toute autre propriété est refusée. */
public record StartDownloadRequest(@NotNull UUID catalogueEntryId) {
}
