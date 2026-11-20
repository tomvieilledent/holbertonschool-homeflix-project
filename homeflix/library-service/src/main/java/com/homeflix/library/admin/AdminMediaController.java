package com.homeflix.library.admin;

import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.homeflix.library.catalogue.MediaView;

import jakarta.validation.Valid;

/** Réservé au rôle ADMIN par la SecurityConfig (/api/v1/admin/**). */
@RestController
@RequestMapping("/api/v1/admin/media/{mediaId}")
public class AdminMediaController {

    private final AdminMediaService service;

    public AdminMediaController(AdminMediaService service) {
        this.service = service;
    }

    @PatchMapping
    public MediaView update(@PathVariable UUID mediaId, @Valid @RequestBody MediaMetadataUpdate update) {
        return service.update(mediaId, update);
    }

    @DeleteMapping
    public ResponseEntity<Void> remove(@PathVariable UUID mediaId) {
        service.remove(mediaId);
        return ResponseEntity.noContent().build();
    }
}
