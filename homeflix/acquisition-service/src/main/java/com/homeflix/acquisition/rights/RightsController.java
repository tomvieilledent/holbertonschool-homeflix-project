package com.homeflix.acquisition.rights;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.homeflix.acquisition.security.CurrentAccount;

import jakarta.validation.Valid;

/** Rappel des droits (réservé au rôle ADMIN, voir docs/api/acquisition.openapi.yaml). Le compte vient du jeton. */
@RestController
@RequestMapping("/api/v1/rights-notice")
@PreAuthorize("hasRole('ADMIN')")
public class RightsController {

    private final RightsNoticeService service;
    private final CurrentAccount currentAccount;

    public RightsController(RightsNoticeService service, CurrentAccount currentAccount) {
        this.service = service;
        this.currentAccount = currentAccount;
    }

    @GetMapping
    public RightsNoticeResponse get() {
        return service.notice(currentAccount.accountId());
    }

    @PostMapping("/ack")
    public RightsNoticeResponse acknowledge(@Valid @RequestBody RightsAckRequest request) {
        return service.acknowledge(currentAccount.accountId(), request.noticeVersion());
    }
}
