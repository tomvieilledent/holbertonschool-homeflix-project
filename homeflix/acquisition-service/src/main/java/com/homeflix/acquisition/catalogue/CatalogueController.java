package com.homeflix.acquisition.catalogue;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.homeflix.acquisition.api.ApiException;

/** Catalogue autorisé (réservé au rôle ADMIN, voir docs/api/acquisition.openapi.yaml). */
@RestController
@RequestMapping("/api/v1/catalogue")
@PreAuthorize("hasRole('ADMIN')")
public class CatalogueController {

    static final int DEFAULT_SIZE = 20;
    static final int MAX_SIZE = 50;

    private final CatalogueService service;

    public CatalogueController(CatalogueService service) {
        this.service = service;
    }

    @GetMapping
    public CataloguePageResponse list(@RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "" + DEFAULT_SIZE) int size) {
        if (page < 0) {
            throw ApiException.validation("page", "La page doit être supérieure ou égale à 0");
        }
        if (size < 1 || size > MAX_SIZE) {
            throw ApiException.validation("size", "La taille doit être comprise entre 1 et " + MAX_SIZE);
        }
        return service.list(page, size);
    }
}
