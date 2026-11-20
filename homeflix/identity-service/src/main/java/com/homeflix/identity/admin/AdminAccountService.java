package com.homeflix.identity.admin;

import java.time.Clock;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.homeflix.identity.account.Account;
import com.homeflix.identity.account.AccountRepository;
import com.homeflix.identity.account.RefreshTokenRepository;
import com.homeflix.identity.account.Role;
import com.homeflix.identity.account.RoleRepository;
import com.homeflix.identity.error.ApiException;
import com.homeflix.identity.setup.AccountResponse;

/** Gestion des comptes par l'administrateur (la route est réservée au rôle ADMIN par SecurityConfig). */
@Service
public class AdminAccountService {

    static final int MAX_SIZE = 100;

    private final AccountRepository accounts;
    private final RoleRepository roles;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder encoder;
    private final Clock clock;

    public AdminAccountService(AccountRepository accounts, RoleRepository roles, RefreshTokenRepository refreshTokens,
            PasswordEncoder encoder, Clock clock) {
        this.accounts = accounts;
        this.roles = roles;
        this.refreshTokens = refreshTokens;
        this.encoder = encoder;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public AccountPage list(int page, int size) {
        if (page < 0) {
            throw invalid("page", "La page doit être positive ou nulle.");
        }
        if (size < 1 || size > MAX_SIZE) {
            throw invalid("size", "La taille doit être comprise entre 1 et " + MAX_SIZE + ".");
        }
        Page<Account> result = accounts.findAll(PageRequest.of(page, size, Sort.by("createdAt", "username")));
        List<AccountResponse> items = result.getContent().stream().map(AccountResponse::from).toList();
        return new AccountPage(items, page, size, result.getTotalElements(), result.getTotalPages());
    }

    @Transactional(readOnly = true)
    public AccountResponse get(UUID id) {
        return AccountResponse.from(accounts.findById(id).orElseThrow(AdminAccountService::notFound));
    }

    @Transactional
    public AccountResponse create(AccountCreate request) {
        String username = request.username().trim();
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        if (accounts.existsByUsername(username) || accounts.existsByEmail(email)) {
            throw new ApiException(HttpStatus.CONFLICT, "CONFLICT", "Conflit",
                "Cet identifiant ou cette adresse e-mail est déjà utilisé.");
        }
        Account account = accounts.saveAndFlush(new Account(username, email, encoder.encode(request.password()),
            roles.getReferenceById(request.role())));
        return AccountResponse.from(account);
    }

    /**
     * Les comptes ADMIN sont verrouillés avant de compter : deux administrateurs qui se désactivent en même
     * temps ne peuvent pas laisser le système sans administrateur.
     */
    @Transactional
    public AccountResponse update(UUID id, AccountUpdate patch) {
        if (patch.enabled() == null && patch.role() == null) {
            throw invalid("enabled", "Indiquez enabled et/ou role.");
        }
        accounts.lockAdmins();
        Account account = accounts.findById(id).orElseThrow(AdminAccountService::notFound);
        boolean loosesAdmin = Role.ADMIN.equals(account.getRole().getName()) && account.isEnabled()
            && (Boolean.FALSE.equals(patch.enabled()) || patch.role() != null && !Role.ADMIN.equals(patch.role()));
        if (loosesAdmin && accounts.countByRoleNameAndEnabledTrue(Role.ADMIN) <= 1) {
            throw new ApiException(HttpStatus.CONFLICT, "LAST_ADMIN", "Dernier administrateur",
                "Le dernier administrateur ne peut être ni désactivé ni rétrogradé.");
        }
        if (patch.role() != null) {
            account.setRole(roles.getReferenceById(patch.role()));
        }
        if (patch.enabled() != null) {
            account.setEnabled(patch.enabled());
            if (!patch.enabled()) {
                refreshTokens.revokeAllOfAccount(id, clock.instant());
            }
        }
        return AccountResponse.from(accounts.saveAndFlush(account));
    }

    /** Mot de passe temporaire : changement obligatoire à la prochaine connexion, sessions existantes coupées. */
    @Transactional
    public void resetPassword(UUID id, PasswordReset request) {
        Account account = accounts.findById(id).orElseThrow(AdminAccountService::notFound);
        account.setPasswordHash(encoder.encode(request.temporaryPassword()));
        account.setMustChangePassword(true);
        refreshTokens.revokeAllOfAccount(id, clock.instant());
    }

    private static ApiException invalid(String field, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Requête invalide",
            field + " : " + message);
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Introuvable", "Compte introuvable.");
    }
}
