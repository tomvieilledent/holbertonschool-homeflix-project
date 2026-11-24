package com.homeflix.identity.status;

/** État d'un service (UP, DOWN) ou de l'ensemble (UP, DEGRADED). Jamais de détail technique. */
public enum ServiceState {
    UP,
    DOWN,
    DEGRADED
}
