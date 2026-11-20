package com.homeflix.acquisition.torrent;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuration du client Transmission (jamais exposée au frontend, jamais journalisée).
 *
 * @param url          adresse du RPC sur le réseau interne (`TRANSMISSION_URL`)
 * @param user         identifiant du RPC (`TRANSMISSION_USER`)
 * @param password     mot de passe du RPC (`TRANSMISSION_PASS`)
 * @param timeout      délai de connexion et de lecture (3 s, comme le JWKS)
 * @param downloadDir  dossier des fichiers terminés, imposé à chaque ajout (`/downloads/complete`)
 * @param downloadsRoot racine des téléchargements, partagée avec Library (`DOWNLOADS_ROOT`) : les chemins de
 *                      fichiers renvoyés lui sont relatifs
 */
@ConfigurationProperties("acquisition.transmission")
public record TransmissionProperties(String url, String user, String password, Duration timeout, String downloadDir,
        String downloadsRoot) {

    public TransmissionProperties {
        if (timeout == null) {
            timeout = Duration.ofSeconds(3);
        }
        if (downloadsRoot == null || downloadsRoot.isBlank()) {
            downloadsRoot = "/downloads";
        }
        if (downloadDir == null || downloadDir.isBlank()) {
            downloadDir = downloadsRoot + "/complete";
        }
    }

    /** Pas de mot de passe dans les journaux ni dans une trace. */
    @Override
    public String toString() {
        return "TransmissionProperties[url=" + url + ", timeout=" + timeout + ", downloadDir=" + downloadDir + "]";
    }
}
