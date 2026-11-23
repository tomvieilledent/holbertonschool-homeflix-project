package com.homeflix.acquisition.rights;

import jakarta.validation.constraints.NotBlank;

/** Corps de l'acquittement : la version du rappel lue par l'administrateur. Toute autre propriété est refusée. */
public record RightsAckRequest(@NotBlank String noticeVersion) {
}
