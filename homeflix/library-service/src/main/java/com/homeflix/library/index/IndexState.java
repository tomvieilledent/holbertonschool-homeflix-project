package com.homeflix.library.index;

/** État de l'indexation (voir IndexJob dans docs/api/library.openapi.yaml). */
public enum IndexState {
    IDLE,
    RUNNING,
    COMPLETED,
    FAILED
}
