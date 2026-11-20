package com.homeflix.identity.account;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProfileRepository extends JpaRepository<Profile, UUID> {

    List<Profile> findByAccountId(UUID accountId);

    List<Profile> findByAccountIdOrderByCreatedAtAsc(UUID accountId);

    Optional<Profile> findByIdAndAccountId(UUID id, UUID accountId);

    Optional<Profile> findByAccountIdAndName(UUID accountId, String name);

    long countByAccountId(UUID accountId);

    boolean existsByIdAndAccountId(UUID id, UUID accountId);
}
