package com.homeflix.identity.account;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface AccountRepository extends JpaRepository<Account, UUID> {

    Optional<Account> findByUsername(String username);

    boolean existsByUsername(String username);

    boolean existsByEmail(String email);
    boolean existsByRoleName(String roleName);

    long countByRoleNameAndEnabledTrue(String roleName);
}
