package com.homeflix.identity.security;

import java.util.Map;
import java.util.concurrent.TimeUnit;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Clés publiques de signature, pour la validation des jetons par Library et Acquisition.
 * Réseau interne uniquement : le reverse proxy ne route pas /.well-known.
 */
@RestController
public class JwksController {

    private final SigningKeyProvider keys;

    public JwksController(SigningKeyProvider keys) {
        this.keys = keys;
    }

    @GetMapping(value = "/.well-known/jwks.json", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> jwks() {
        return ResponseEntity.ok()
            .cacheControl(CacheControl.maxAge(5, TimeUnit.MINUTES).cachePublic())
            .body(keys.publicJwkSet().toJSONObject(true));
    }
}
