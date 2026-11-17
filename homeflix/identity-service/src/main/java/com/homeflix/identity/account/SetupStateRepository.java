package com.homeflix.identity.account;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SetupStateRepository extends JpaRepository<SetupState, Boolean> {
}
