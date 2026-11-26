package com.homeflix.acquisition.internal;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

/** API de service à service : jamais routée par le reverse proxy, secret `X-Internal-Key` exigé. */
@RestController
@RequestMapping("/internal")
public class InternalController {

    private final AccountPurgeService service;

    public InternalController(AccountPurgeService service) {
        this.service = service;
    }

    @PostMapping("/purge")
    public ResponseEntity<Void> purge(@Valid @RequestBody PurgeRequest request) {
        service.purge(request.accountId());
        return ResponseEntity.noContent().build();
    }
}
