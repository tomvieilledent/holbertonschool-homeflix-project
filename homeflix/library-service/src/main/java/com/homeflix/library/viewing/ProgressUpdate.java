package com.homeflix.library.viewing;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record ProgressUpdate(
        @NotNull @Min(0) @Max(10_000_000) Integer positionSeconds,
        @NotNull @Min(1) @Max(10_000_000) Integer durationSeconds) {
}
