package com.homeflix.identity.admin;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.homeflix.identity.account.AccountDeletionService;
import com.homeflix.identity.setup.AccountResponse;

import jakarta.validation.Valid;

/** Défense en profondeur : rôle ADMIN exigé par SecurityConfig (/api/v1/admin/**) et par @PreAuthorize. */
@RestController
@RequestMapping("/api/v1/admin/accounts")
@PreAuthorize("hasRole('ADMIN')")
public class AdminAccountController {

    private final AdminAccountService service;
    private final AccountDeletionService deletion;

    public AdminAccountController(AdminAccountService service, AccountDeletionService deletion) {
        this.service = service;
        this.deletion = deletion;
    }

    @GetMapping
    public AccountPage list(@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return service.list(page, size);
    }

    @GetMapping("/{accountId}")
    public AccountResponse get(@PathVariable UUID accountId) {
        return service.get(accountId);
    }

    @PostMapping
    public ResponseEntity<AccountResponse> create(@Valid @RequestBody AccountCreate request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
    }

    @PatchMapping("/{accountId}")
    public AccountResponse update(@PathVariable UUID accountId, @Valid @RequestBody AccountUpdate patch) {
        return service.update(accountId, patch);
    }

    @PostMapping("/{accountId}/password-reset")
    public ResponseEntity<Void> resetPassword(@PathVariable UUID accountId, @Valid @RequestBody PasswordReset request) {
        service.resetPassword(accountId, request);
        return ResponseEntity.noContent().build();
    }

    /** Supprime un compte et ses données (purge Library comprise). Dernier administrateur : 409 LAST_ADMIN. */
    @DeleteMapping("/{accountId}")
    public ResponseEntity<Void> delete(@PathVariable UUID accountId) {
        deletion.delete(accountId, account -> true);
        return ResponseEntity.noContent().build();
    }
}
