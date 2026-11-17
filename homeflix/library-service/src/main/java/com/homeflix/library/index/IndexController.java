package com.homeflix.library.index;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Indexation manuelle (réservée au rôle ADMIN par la SecurityConfig, voir docs/api/library.openapi.yaml). */
@RestController
@RequestMapping("/api/v1/admin/index")
public class IndexController {

    private final IndexService service;

    public IndexController(IndexService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    public IndexStatus start() {
        return service.start();
    }

    @GetMapping("/status")
    public IndexStatus status() {
        return service.status();
    }
}
