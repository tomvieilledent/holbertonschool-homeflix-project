package com.homeflix.acquisition.rights;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RightsAcknowledgementRepository extends JpaRepository<RightsAcknowledgement, RightsAcknowledgementId> {

    @Modifying
    @Query("delete from RightsAcknowledgement a where a.id.accountId = :accountId")
    void deleteByAccountId(@Param("accountId") UUID accountId);
}
