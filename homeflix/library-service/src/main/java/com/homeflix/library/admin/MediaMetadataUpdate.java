package com.homeflix.library.admin;

import java.util.List;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

/** Correction partielle des métadonnées : les champs absents restent inchangés. */
public record MediaMetadataUpdate(
        @Size(min = 1, max = 200) String title,
        @Size(max = 2000) String description,
        @Size(max = 10) List<@Size(max = 40) String> genres,
        @Min(1888) @Max(2100) Integer year) {

    boolean isEmpty() {
        return title == null && description == null && genres == null && year == null;
    }
}
