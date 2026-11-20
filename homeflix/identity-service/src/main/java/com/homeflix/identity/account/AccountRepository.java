package com.homeflix.identity.account;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import jakarta.persistence.LockModeType;

public interface AccountRepository extends JpaRepository<Account, UUID> {

    Optional<Account> findByUsername(String username);

    boolean existsByUsername(String username);

    boolean existsByEmail(String email);
    boolean existsByRoleName(String roleName);

    long countByRoleNameAndEnabledTrue(String roleName);

    /** Verrouille tous les administrateurs : sérialise les opérations qui peuvent supprimer le dernier. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a.id from Account a where a.role.name = 'ADMIN'")
    List<UUID> lockAdmins();
}
