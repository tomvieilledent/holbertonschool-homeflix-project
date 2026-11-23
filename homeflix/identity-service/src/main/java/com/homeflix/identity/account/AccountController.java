package com.homeflix.identity.account;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.http.ResponseCookie;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

import java.util.UUID;

/** Le compte de l'appelant. L'identifiant vient du jeton, jamais de l'URL ni du corps. */
@RestController
@RequestMapping("/api/v1/accounts/me")
public class AccountController {

    private final AccountDeletionService deletion;
    private final PasswordEncoder encoder;

    public AccountController(AccountDeletionService deletion, PasswordEncoder encoder) {
        this.deletion = deletion;
        this.encoder = encoder;
    }

    /** Supprime son propre compte, après confirmation du mot de passe. Le cookie de session est effacé. */
    @DeleteMapping
    public ResponseEntity<Void> deleteMe(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PasswordConfirmation request) {
        deletion.delete(UUID.fromString(jwt.getSubject()),
            account -> encoder.matches(request.password(), account.getPasswordHash()));
        return ResponseEntity.noContent()
            .header(HttpHeaders.SET_COOKIE, ResponseCookie.from("refresh_token", "").path("/api/v1/auth")
                .httpOnly(true).sameSite("Strict").maxAge(0).build().toString())
            .build();
    }
}
