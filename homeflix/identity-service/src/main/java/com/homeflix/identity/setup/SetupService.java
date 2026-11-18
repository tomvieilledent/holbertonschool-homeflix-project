package com.homeflix.identity.setup;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.homeflix.identity.account.Account;
import com.homeflix.identity.account.AccountRepository;
import com.homeflix.identity.account.Role;
import com.homeflix.identity.account.RoleRepository;
import com.homeflix.identity.account.SetupState;
import com.homeflix.identity.account.SetupStateRepository;
import com.homeflix.identity.error.ApiException;

/**
 * Création du premier administrateur, protégée par un jeton de setup à usage unique.
 * Seul le hachage SHA-256 du jeton est stocké ; il est supprimé dès que la configuration est terminée.
 */
@Service
public class SetupService {

    private static final Logger log = LoggerFactory.getLogger(SetupService.class);

    private final SetupStateRepository states;
    private final AccountRepository accounts;
    private final RoleRepository roles;
    private final PasswordEncoder encoder;
    private final String configuredToken;

    public SetupService(SetupStateRepository states, AccountRepository accounts, RoleRepository roles,
            PasswordEncoder encoder, @Value("${homeflix.setup.token:}") String configuredToken) {
        this.states = states;
        this.accounts = accounts;
        this.roles = roles;
        this.encoder = encoder;
        this.configuredToken = configuredToken == null ? "" : configuredToken.trim();
    }

    @Transactional(readOnly = true)
    public SetupStatus status() {
        boolean done = accounts.existsByRoleName(Role.ADMIN)
            || states.findAll().stream().anyMatch(SetupState::isCompleted);
        return new SetupStatus(!done);
    }

    /**
     * Au démarrage : prépare le jeton de setup tant qu'aucun administrateur n'existe. Le jeton vient de
     * SETUP_TOKEN, sinon il est généré et écrit dans les journaux (jamais committé).
     */
    @Transactional
    public void initialize() {
        SetupState state = states.findForUpdate().orElse(null);
        if (accounts.existsByRoleName(Role.ADMIN)) {
            if (state == null) {
                state = new SetupState(null);
            }
            if (!state.isCompleted()) {
                state.complete(Instant.now());
            }
            states.save(state);
            return;
        }
        if (state != null && state.isCompleted()) {
            return;
        }
        String token = configuredToken;
        boolean generated = token.isEmpty();
        if (generated) {
            byte[] bytes = new byte[24];
            new SecureRandom().nextBytes(bytes);
            token = HexFormat.of().formatHex(bytes);
        }
        if (state == null) {
            states.save(new SetupState(hash(token)));
        } else {
            state.changeToken(hash(token));
            states.save(state);
        }
        if (generated) {
            log.warn("Aucun administrateur : jeton de setup à usage unique (valable jusqu'au prochain démarrage) : {}", token);
        } else {
            log.info("Aucun administrateur : la création du premier compte attend le jeton SETUP_TOKEN.");
        }
    }

    @Transactional
    public Account createFirstAdmin(SetupRequest request) {
        // Ligne verrouillée : une seule des requêtes simultanées peut aboutir.
        SetupState state = states.findForUpdate().orElse(null);
        if (state != null && state.isCompleted() || accounts.existsByRoleName(Role.ADMIN)) {
            throw new ApiException(HttpStatus.CONFLICT, "SETUP_ALREADY_DONE", "Configuration déjà effectuée",
                "Le premier administrateur existe déjà.");
        }
        if (state == null || state.getTokenHash() == null || !matches(request.setupToken(), state.getTokenHash())) {
            throw new ApiException(HttpStatus.FORBIDDEN, "SETUP_TOKEN_INVALID", "Jeton de setup invalide",
                "Le jeton de setup est invalide.");
        }
        String username = request.username().trim();
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        if (accounts.existsByUsername(username) || accounts.existsByEmail(email)) {
            throw new ApiException(HttpStatus.CONFLICT, "CONFLICT", "Conflit",
                "Cet identifiant ou cette adresse e-mail est déjà utilisé.");
        }
        Account admin = accounts.save(new Account(username, email, encoder.encode(request.password()),
            roles.getReferenceById(Role.ADMIN)));
        state.complete(Instant.now());
        states.save(state);
        return admin;
    }

    private static boolean matches(String provided, String storedHash) {
        return MessageDigest.isEqual(hash(provided).getBytes(StandardCharsets.US_ASCII),
            storedHash.getBytes(StandardCharsets.US_ASCII));
    }

    private static String hash(String token) {
        try {
            return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
