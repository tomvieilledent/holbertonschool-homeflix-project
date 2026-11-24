package com.homeflix.identity.status;

import org.springframework.boot.health.actuate.endpoint.HealthEndpoint;

/**
 * État d'Identity lui-même, lu en mémoire (aucun appel réseau vers soi-même). Le statut de santé de Spring inclut sa
 * base de données : base injoignable, service DOWN.
 */
class LocalServiceProbe implements ServiceProbe {

    private final HealthEndpoint health;

    LocalServiceProbe(HealthEndpoint health) {
        this.health = health;
    }

    @Override
    public String name() {
        return "identity";
    }

    @Override
    public ServiceState check() {
        try {
            return "UP".equals(health.health().getStatus().getCode()) ? ServiceState.UP : ServiceState.DOWN;
        } catch (RuntimeException e) {
            return ServiceState.DOWN;
        }
    }
}
