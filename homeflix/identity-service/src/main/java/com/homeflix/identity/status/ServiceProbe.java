package com.homeflix.identity.status;

/** Sonde de l'état d'un service. Ne lève jamais d'exception : une panne se traduit par {@link ServiceState#DOWN}. */
public interface ServiceProbe {

    /** Nom du service tel que l'API le publie (identity, library, acquisition). */
    String name();

    ServiceState check();
}
