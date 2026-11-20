package com.homeflix.identity.error;

import java.time.Duration;

import org.springframework.http.HttpStatus;

/** Trop de tentatives : 429 `RATE_LIMITED` avec l'en-tête `Retry-After` (en secondes). */
public class RateLimitedException extends ApiException {

    private final long retryAfterSeconds;

    public RateLimitedException(Duration retryAfter) {
        super(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED", "Trop de tentatives",
            "Trop de tentatives de connexion. Réessayez plus tard.");
        this.retryAfterSeconds = Math.max(1, (retryAfter.toMillis() + 999) / 1000);
    }

    public long retryAfterSeconds() {
        return retryAfterSeconds;
    }
}
