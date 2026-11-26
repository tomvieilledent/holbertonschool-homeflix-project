package com.homeflix.acquisition.torrent;

import java.time.Instant;
import java.util.List;

/**
 * État d'un torrent vu par le client BitTorrent.
 *
 * @param state           QUEUED (en attente, vérification, métadonnées pas encore reçues sans pairs), DOWNLOADING,
 *                        COMPLETED ou FAILED. L'annulation (CANCELLED) est décidée par Acquisition, pas par le client.
 * @param progressPercent 0 à 100
 * @param errorCode       présent si FAILED : {@code DISK_FULL} ou {@code TORRENT_CLIENT_UNAVAILABLE} (voir
 *                        docs/api/CONVENTIONS.md). {@code NO_PEERS} se décide dans la synchronisation (#99), qui
 *                        connaît la durée d'attente.
 * @param files           fichiers du torrent, chemins **relatifs au dossier de téléchargements** (`/downloads`), sans
 *                        {@code ..} ni chemin absolu ; renseigné quand le torrent est terminé
 * @param idleSince       dernière activité d'un torrent en cours **sans aucun pair** ({@link Instant#EPOCH} s'il n'en a
 *                        jamais eu) ; {@code null} dès qu'un pair est connecté
 */
public record TorrentStatus(State state, int progressPercent, String errorCode, List<String> files, Instant idleSince) {

    public enum State { QUEUED, DOWNLOADING, COMPLETED, FAILED }

    public TorrentStatus {
        files = files == null ? List.of() : List.copyOf(files);
    }

    public TorrentStatus(State state, int progressPercent, String errorCode, List<String> files) {
        this(state, progressPercent, errorCode, files, null);
    }
}
