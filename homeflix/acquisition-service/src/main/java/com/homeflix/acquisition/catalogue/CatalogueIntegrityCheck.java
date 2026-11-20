package com.homeflix.acquisition.catalogue;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/** Au démarrage : signale les entrées dont la source (magnet, infohash) est invalide. Ne bloque pas le démarrage. */
@Component
class CatalogueIntegrityCheck implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CatalogueIntegrityCheck.class);

    private final CatalogueService catalogue;

    CatalogueIntegrityCheck(CatalogueService catalogue) {
        this.catalogue = catalogue;
    }

    @Override
    public void run(ApplicationArguments args) {
        int invalid = catalogue.countInvalidSources();
        if (invalid > 0) {
            log.error("Catalogue : {} entrée(s) avec une source invalide, elles ne seront jamais téléchargées", invalid);
        }
    }
}
