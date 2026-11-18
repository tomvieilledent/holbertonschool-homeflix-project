package com.homeflix.identity.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.homeflix.identity.config.SecurityConfig;

import jakarta.validation.Validation;
import jakarta.validation.Validator;

class PasswordTests {

    record Form(@StrongPassword String password) {
    }

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void passwordsAreHashedWithArgon2id() {
        PasswordEncoder encoder = new SecurityConfig().passwordEncoder();
        String hash = encoder.encode("un-mot-de-passe-solide");
        assertThat(hash).startsWith("$argon2id$").doesNotContain("solide");
        assertThat(encoder.matches("un-mot-de-passe-solide", hash)).isTrue();
        assertThat(encoder.matches("autre-mot-de-passe", hash)).isFalse();
        assertThat(encoder).isInstanceOf(Argon2PasswordEncoder.class);
    }

    @Test
    void shortOrBlankPasswordsAreRejected() {
        assertThat(validator.validate(new Form("court"))).isNotEmpty();
        assertThat(validator.validate(new Form(" ".repeat(14)))).isNotEmpty();
        assertThat(validator.validate(new Form(null))).isNotEmpty();
        assertThat(validator.validate(new Form("x".repeat(129)))).isNotEmpty();
    }

    @Test
    void twelveCharactersAreAccepted() {
        assertThat(validator.validate(new Form("douze-chars!"))).isEmpty();
    }
}
