package com.homeflix.acquisition.download;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Déclenche la synchronisation toutes les 5 s (désactivable : `acquisition.sync.enabled=false`). */
@Component
@ConditionalOnProperty(name = "acquisition.sync.enabled", havingValue = "true", matchIfMissing = true)
class DownloadSyncScheduler {

    private final DownloadSyncService sync;

    DownloadSyncScheduler(DownloadSyncService sync) {
        this.sync = sync;
    }

    @Scheduled(fixedDelayString = "${acquisition.sync.interval:5s}", initialDelayString = "${acquisition.sync.interval:5s}")
    void run() {
        sync.sync();
    }
}
