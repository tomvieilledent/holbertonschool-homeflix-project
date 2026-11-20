package com.homeflix.identity.profile;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.homeflix.identity.auth.TokenResponse;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/profiles")
public class ProfileController {

    private final ProfileService service;

    public ProfileController(ProfileService service) {
        this.service = service;
    }

    @GetMapping
    public List<ProfileResponse> list(@AuthenticationPrincipal Jwt jwt) {
        return service.list(accountId(jwt));
    }

    @PostMapping
    public ResponseEntity<ProfileResponse> create(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody ProfileInput input) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(accountId(jwt), input));
    }

    @PatchMapping("/{profileId}")
    public ProfileResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID profileId,
            @Valid @RequestBody ProfilePatch patch) {
        return service.update(accountId(jwt), profileId, patch);
    }

    @DeleteMapping("/{profileId}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID profileId) {
        service.delete(accountId(jwt), profileId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{profileId}/select")
    public TokenResponse select(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID profileId) {
        return service.select(accountId(jwt), profileId);
    }

    private static UUID accountId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
