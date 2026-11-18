package com.homeflix.identity.setup;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/setup")
public class SetupController {

    private final SetupService setup;

    public SetupController(SetupService setup) {
        this.setup = setup;
    }

    @GetMapping("/status")
    public SetupStatus status() {
        return setup.status();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AccountResponse create(@Valid @RequestBody SetupRequest request) {
        return AccountResponse.from(setup.createFirstAdmin(request));
    }
}
