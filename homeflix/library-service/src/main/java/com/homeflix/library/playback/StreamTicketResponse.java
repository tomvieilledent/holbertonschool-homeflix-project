package com.homeflix.library.playback;

import java.time.Instant;

public record StreamTicketResponse(String url, Instant expiresAt) {
}
