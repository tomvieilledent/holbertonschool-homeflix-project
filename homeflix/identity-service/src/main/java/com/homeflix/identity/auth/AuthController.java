package com.homeflix.identity.auth;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.homeflix.identity.error.ApiException;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    static final String COOKIE = "refresh_token";
    static final String COOKIE_PATH = "/api/v1/auth";
    static final String CSRF_HEADER = "X-Requested-With";
    static final String CSRF_VALUE = "homeflix";

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

    /** Compte, rôle et profil actif de la session (jeton d'accès exigé : règle `authenticated` de SecurityConfig). */
    @GetMapping("/me")
    public MeResponse me(@AuthenticationPrincipal Jwt jwt) {
        return auth.me(jwt);
    }

    @PostMapping("/refresh")
    public ResponseEntity<TokenResponse> refresh(
            @RequestHeader(value = CSRF_HEADER, required = false) String requestedWith,
            @CookieValue(name = COOKIE, required = false) String refreshToken) {
        requireCsrfHeader(requestedWith);
        AuthService.Session session = auth.refresh(refreshToken);
        return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, refreshCookie(session.refreshToken()).toString())
            .body(session.tokens());
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            @RequestHeader(value = CSRF_HEADER, required = false) String requestedWith,
            @CookieValue(name = COOKIE, required = false) String refreshToken) {
        requireCsrfHeader(requestedWith);
        auth.logout(refreshToken);
        return ResponseEntity.noContent()
            .header(HttpHeaders.SET_COOKIE, refreshCookie("").mutate().maxAge(0).build().toString())
            .build();
    }

    /** Protection CSRF : un formulaire inter-sites ne peut pas envoyer cet en-tête (voir ADR 0001). */
    private static void requireCsrfHeader(String requestedWith) {
        if (!CSRF_VALUE.equals(requestedWith)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "ACCESS_DENIED", "Accès refusé",
                "En-tête X-Requested-With manquant ou invalide.");
        }
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
