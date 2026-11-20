package com.homeflix.identity.account;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProfileRepository extends JpaRepository<Profile, UUID> {

    List<Profile> findByAccountId(UUID accountId);

    long countByAccountId(UUID accountId);

    boolean existsByIdAndAccountId(UUID id, UUID accountId);
}
