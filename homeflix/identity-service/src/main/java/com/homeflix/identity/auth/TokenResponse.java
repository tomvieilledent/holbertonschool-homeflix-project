package com.homeflix.identity.auth;

public record TokenResponse(String accessToken, long expiresIn, String tokenType) {

    public static TokenResponse bearer(String accessToken, long expiresIn) {
        return new TokenResponse(accessToken, expiresIn, "Bearer");
    }
}
