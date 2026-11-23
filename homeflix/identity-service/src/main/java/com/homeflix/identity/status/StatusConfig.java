package com.homeflix.identity.status;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.health.actuate.endpoint.HealthEndpoint;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Les trois sondes de l'agrégateur d'état, dans l'ordre où l'API les publie. */
@Configuration
class StatusConfig {

    /** Délai de connexion et de lecture de chaque sonde : une page d'administration ne doit pas attendre longtemps. */
    static final Duration PROBE_TIMEOUT = Duration.ofSeconds(2);

    @Bean
    ServiceProbe identityProbe(HealthEndpoint health) {
        return new LocalServiceProbe(health);
    }

    @Bean
    ServiceProbe libraryProbe(@Value("${homeflix.library.url}") String libraryUrl) {
        return new HttpServiceProbe("library", libraryUrl, PROBE_TIMEOUT);
    }

    @Bean
    ServiceProbe acquisitionProbe(@Value("${homeflix.acquisition.url}") String acquisitionUrl) {
        return new HttpServiceProbe("acquisition", acquisitionUrl, PROBE_TIMEOUT);
    }
}
