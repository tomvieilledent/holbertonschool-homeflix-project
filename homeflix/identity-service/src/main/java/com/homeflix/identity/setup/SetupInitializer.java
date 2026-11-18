package com.homeflix.identity.setup;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Prépare le jeton de setup au démarrage (désactivable : homeflix.setup.init-on-startup=false). */
@Component
@ConditionalOnProperty(name = "homeflix.setup.init-on-startup", havingValue = "true", matchIfMissing = true)
class SetupInitializer implements ApplicationRunner {

    private final SetupService setup;

    SetupInitializer(SetupService setup) {
        this.setup = setup;
    }

    @Override
    public void run(ApplicationArguments args) {
        setup.initialize();
    }
}
