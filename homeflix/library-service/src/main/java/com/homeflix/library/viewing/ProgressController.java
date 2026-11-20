package com.homeflix.library.viewing;

import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.homeflix.library.security.CurrentProfile;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/media/{mediaId}/progress")
public class ProgressController {

    private final CurrentProfile current;
    private final ProgressService service;

    public ProgressController(CurrentProfile current, ProgressService service) {
        this.current = current;
        this.service = service;
    }

    @GetMapping
    public ProgressView get(@PathVariable UUID mediaId) {
        return service.get(current.profileId(), mediaId);
    }

    @PutMapping
    public ProgressView put(@PathVariable UUID mediaId, @Valid @RequestBody ProgressUpdate update) {
        UUID profileId = current.profileId();
        return service.save(current.accountId(), profileId, mediaId, update);
    }

    @DeleteMapping
    public ResponseEntity<Void> delete(@PathVariable UUID mediaId) {
        service.reset(current.profileId(), mediaId);
        return ResponseEntity.noContent().build();
    }
}
