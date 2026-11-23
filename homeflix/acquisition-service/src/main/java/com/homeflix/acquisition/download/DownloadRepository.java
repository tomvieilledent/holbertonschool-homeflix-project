package com.homeflix.acquisition.download;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DownloadRepository extends JpaRepository<Download, UUID> {

    /** Téléchargements actifs (en file ou en cours) pour ces entrées : sert à renseigner `activeDownloadId`. */
    List<Download> findByEntryIdInAndStateIn(Collection<UUID> entryIds, Collection<DownloadState> states);

    Page<Download> findByState(DownloadState state, Pageable pageable);

    Optional<Download> findByEntryIdAndStateIn(UUID entryId, Collection<DownloadState> states);
}
