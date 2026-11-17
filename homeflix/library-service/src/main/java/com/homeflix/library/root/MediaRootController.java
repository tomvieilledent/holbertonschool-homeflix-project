package com.homeflix.library.root;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.homeflix.library.api.ApiException;

import jakarta.validation.Valid;

/** Dossiers autorisés (réservé au rôle ADMIN par la SecurityConfig, voir docs/api/library.openapi.yaml). */
@RestController
@RequestMapping("/api/v1/admin/media-roots")
public class MediaRootController {

    private final MediaRootService service;

    public MediaRootController(MediaRootService service) {
        this.service = service;
    }

    @GetMapping
    public List<MediaRootResponse> list() {
        return service.list();
    }

    @PostMapping
    public ResponseEntity<MediaRootResponse> create(@Valid @RequestBody MediaRootInput input) {
        MediaRootResponse created = service.create(input);
        return ResponseEntity.created(URI.create("/api/v1/admin/media-roots/" + created.id())).body(created);
    }

    @PostMapping("/validate")
    public RootValidation validate(@Valid @RequestBody MediaRootInput input) {
        return service.validate(input.path());
    }

    @PatchMapping("/{rootId}")
    public MediaRootResponse update(@PathVariable UUID rootId, @Valid @RequestBody MediaRootPatch patch) {
        if (patch.isEmpty()) {
            throw ApiException.validation("body", "Indiquez au moins un champ à modifier (label ou enabled)");
        }
        return service.update(rootId, patch);
    }

    @DeleteMapping("/{rootId}")
    public ResponseEntity<Void> remove(@PathVariable UUID rootId) {
        service.remove(rootId);
        return ResponseEntity.noContent().build();
    }
}
