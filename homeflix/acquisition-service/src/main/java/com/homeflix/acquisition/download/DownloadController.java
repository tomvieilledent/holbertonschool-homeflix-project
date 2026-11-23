package com.homeflix.acquisition.download;

import java.net.URI;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.homeflix.acquisition.api.ApiException;
import com.homeflix.acquisition.security.CurrentAccount;

import jakarta.validation.Valid;

/** Téléchargements (réservés au rôle ADMIN, voir docs/api/acquisition.openapi.yaml). */
@RestController
@RequestMapping("/api/v1/downloads")
@PreAuthorize("hasRole('ADMIN')")
public class DownloadController {

    static final int DEFAULT_SIZE = 20;
    static final int MAX_SIZE = 50;

    private final DownloadService service;
    private final CurrentAccount currentAccount;

    public DownloadController(DownloadService service, CurrentAccount currentAccount) {
        this.service = service;
        this.currentAccount = currentAccount;
    }

    @PostMapping
    public ResponseEntity<DownloadResponse> start(@Valid @RequestBody StartDownloadRequest request) {
        DownloadResponse created = service.start(request.catalogueEntryId(), currentAccount.accountId());
        return ResponseEntity.accepted().location(URI.create("/api/v1/downloads/" + created.id())).body(created);
    }

    @GetMapping
    public DownloadPageResponse list(@RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "" + DEFAULT_SIZE) int size,
            @RequestParam(required = false) DownloadState state) {
        if (page < 0) {
            throw ApiException.validation("page", "La page doit être supérieure ou égale à 0");
        }
        if (size < 1 || size > MAX_SIZE) {
            throw ApiException.validation("size", "La taille doit être comprise entre 1 et " + MAX_SIZE);
        }
        return service.list(page, size, state);
    }

    @GetMapping("/{downloadId}")
    public DownloadResponse get(@PathVariable UUID downloadId) {
        return service.get(downloadId);
    }

    @PostMapping("/{downloadId}/cancel")
    public DownloadResponse cancel(@PathVariable UUID downloadId) {
        return service.cancel(downloadId);
    }
}
