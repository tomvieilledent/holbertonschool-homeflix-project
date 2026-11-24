package com.homeflix.identity.status;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** État des services pour l'administration. Défense en profondeur : rôle ADMIN exigé par SecurityConfig et ici. */
@RestController
@RequestMapping("/api/v1/admin/system")
@PreAuthorize("hasRole('ADMIN')")
public class SystemStatusController {

    private final SystemStatusService service;

    public SystemStatusController(SystemStatusService service) {
        this.service = service;
    }

    @GetMapping("/status")
    public SystemStatusResponse status() {
        return service.status();
    }
}
