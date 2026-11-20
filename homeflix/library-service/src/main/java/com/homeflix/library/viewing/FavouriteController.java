package com.homeflix.library.viewing;

import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.homeflix.library.catalogue.MediaPage;
import com.homeflix.library.security.CurrentProfile;

@RestController
@RequestMapping("/api/v1/me/favourites")
public class FavouriteController {

    private final CurrentProfile current;
    private final FavouriteService service;

    public FavouriteController(CurrentProfile current, FavouriteService service) {
        this.current = current;
        this.service = service;
    }

    @GetMapping
    public MediaPage list(@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return service.list(current.profileId(), page, size);
    }

    @PutMapping("/{mediaId}")
    public ResponseEntity<Void> add(@PathVariable UUID mediaId) {
        UUID profileId = current.profileId();
        service.add(current.accountId(), profileId, mediaId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{mediaId}")
    public ResponseEntity<Void> remove(@PathVariable UUID mediaId) {
        service.remove(current.profileId(), mediaId);
        return ResponseEntity.noContent().build();
    }
}
