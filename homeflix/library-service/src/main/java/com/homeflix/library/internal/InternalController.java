package com.homeflix.library.internal;

import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.homeflix.library.index.IndexStatus;

import jakarta.validation.Valid;

/** API de service à service : jamais routée par le reverse proxy, secret `X-Internal-Key` exigé. */
@RestController
@RequestMapping("/internal")
public class InternalController {

    private final InternalService service;

    public InternalController(InternalService service) {
        this.service = service;
    }

    @PostMapping("/purge")
    public ResponseEntity<Void> purge(@Valid @RequestBody PurgeRequest request) {
        service.purge(request);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/downloads")
    public Map<String, UUID> downloading(@Valid @RequestBody DownloadRequest request) {
        return Map.of("mediaId", service.markDownloading(request));
    }

    @PostMapping("/downloads/completed")
    public Map<String, UUID> completed(@Valid @RequestBody DownloadRequest request) {
        return Map.of("mediaId", service.registerCompleted(request));
    }

    @PostMapping("/reindex")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public IndexStatus reindex() {
        return service.reindex();
    }
}
