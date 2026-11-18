package com.homeflix.identity.auth;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    static final String COOKIE = "refresh_token";
    static final String COOKIE_PATH = "/api/v1/auth";

    private final AuthService auth;
    private final AuthProperties props;

    public AuthController(AuthService auth, AuthProperties props) {
        this.auth = auth;
        this.props = props;
    }

    @PostMapping("/login")
    public ResponseEntity<TokenResponse> login(@Valid @RequestBody LoginRequest request) {
        AuthService.Session session = auth.login(request);
        return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, refreshCookie(session.refreshToken()).toString())
            .body(session.tokens());
    }

    /** Cookie HttpOnly, SameSite=Strict, limité à /api/v1/auth ; Secure sauf en développement local. */
    private ResponseCookie refreshCookie(String value) {
        return ResponseCookie.from(COOKIE, value)
            .httpOnly(true)
            .secure(props.cookieSecure())
            .sameSite("Strict")
            .path(COOKIE_PATH)
            .maxAge(props.refreshTtl())
            .build();
    }
}
