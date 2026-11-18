package com.homeflix.identity.account;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import jakarta.persistence.LockModeType;

public interface SetupStateRepository extends JpaRepository<SetupState, Boolean> {

    /** Verrouille la ligne unique : deux créations simultanées du premier administrateur sont sérialisées. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from SetupState s")
    Optional<SetupState> findForUpdate();
}
