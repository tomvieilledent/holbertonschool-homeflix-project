package com.homeflix.library.viewing;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProgressRepository extends JpaRepository<Progress, ProgressId> {

    List<Progress> findByIdProfileId(UUID profileId);
}
