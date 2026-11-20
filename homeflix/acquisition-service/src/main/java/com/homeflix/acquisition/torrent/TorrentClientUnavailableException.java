package com.homeflix.acquisition.torrent;

import org.springframework.http.HttpStatus;

import com.homeflix.acquisition.api.ApiException;

/**
 * Le client BitTorrent ne répond pas comme attendu (arrêté, injoignable, lent, identifiants refusés, réponse
 * inattendue). Étend {@link ApiException} : toute route qui la laisse remonter répond 503
 * {@code TORRENT_CLIENT_UNAVAILABLE} (contrat), sans détail technique, adresse ni identifiant.
 */
public class TorrentClientUnavailableException extends ApiException {

    public TorrentClientUnavailableException() {
        super(HttpStatus.SERVICE_UNAVAILABLE, "TORRENT_CLIENT_UNAVAILABLE", "Client BitTorrent indisponible",
            "Le service de téléchargement est momentanément indisponible. Réessayez plus tard.");
    }
}
