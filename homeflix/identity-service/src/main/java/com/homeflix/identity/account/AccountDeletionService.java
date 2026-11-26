package com.homeflix.identity.account;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.homeflix.identity.error.ApiException;
import com.homeflix.identity.profile.LibraryPurgeClient;

/**
 * Suppression d'un compte et de ses données. La purge de Library (favoris, progression de tous ses profils) passe
 * avant la suppression locale : si Library est injoignable, rien n'est supprimé (503) et l'opération se rejoue
 * telle quelle. Les profils et les sessions partent avec le compte (clés étrangères en cascade). Aucun fichier média
 * n'est jamais supprimé : Library ne supprime que des données de visionnage.
 */
@Service
public class AccountDeletionService {

    private final AccountRepository accounts;
    private final LibraryPurgeClient library;
    private final AcquisitionPurgeClient acquisition;

    public AccountDeletionService(AccountRepository accounts, LibraryPurgeClient library,
            AcquisitionPurgeClient acquisition) {
        this.accounts = accounts;
        this.library = library;
        this.acquisition = acquisition;
    }

    /**
     * Les administrateurs sont verrouillés avant de compter : deux suppressions simultanées ne peuvent pas laisser
     * le système sans administrateur.
     */
    @Transactional
    public void delete(UUID accountId, java.util.function.Predicate<Account> confirm) {
        accounts.lockAdmins();
        Account account = accounts.findForUpdateById(accountId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Introuvable", "Compte introuvable."));
        if (!confirm.test(account)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID_CREDENTIALS", "Mot de passe incorrect",
                "Le mot de passe est incorrect.");
        }
        boolean activeAdmin = Role.ADMIN.equals(account.getRole().getName()) && account.isEnabled();
        if (activeAdmin && accounts.countByRoleNameAndEnabledTrue(Role.ADMIN) <= 1) {
            throw new ApiException(HttpStatus.CONFLICT, "LAST_ADMIN", "Dernier administrateur",
                "Le dernier administrateur ne peut pas être supprimé.");
        }
        // Acquisition d'abord : si Library échoue ensuite, seul un acquittement des droits est à redonner.
        acquisition.purgeAccount(accountId);
        library.purgeAccount(accountId);
        accounts.delete(account);
    }
}
