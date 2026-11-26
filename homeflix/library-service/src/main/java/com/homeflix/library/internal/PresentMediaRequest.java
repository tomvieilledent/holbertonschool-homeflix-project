package com.homeflix.library.internal;

import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Identifiants de médias dont un autre service veut savoir s'ils sont toujours disponibles. */
public record PresentMediaRequest(@NotNull @Size(max = 100) List<@NotNull UUID> mediaIds) {
}
