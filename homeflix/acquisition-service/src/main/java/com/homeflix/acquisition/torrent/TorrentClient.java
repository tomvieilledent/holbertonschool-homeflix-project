package com.homeflix.acquisition.torrent;

import java.util.Optional;

/**
 * Client BitTorrent piloté par Acquisition (aujourd'hui Transmission, par son API RPC). Le reste du service ne
 * connaît que cette interface : les endpoints de téléchargement (#88) et la synchronisation (#99) s'écrivent
 * contre elle, avec un faux client dans leurs tests.
 *
 * <p>Règles communes :
 * <ul>
 *   <li>Le dossier de destination est imposé par la configuration, jamais par l'appelant.</li>
 *   <li>Le client est identifié par l'{@code infohash} du torrent (stable, en minuscules) : c'est la valeur à
 *       stocker dans {@code downloads.torrent_id}. Elle ne sort jamais de ce service.</li>
 *   <li>Client arrêté, injoignable, trop lent ou qui refuse les identifiants : {@link TorrentClientUnavailableException}
 *       (503 {@code TORRENT_CLIENT_UNAVAILABLE}), sans détail technique.</li>
 * </ul>
 */
public interface TorrentClient {

    /**
     * Démarre le téléchargement d'un lien magnet. Idempotent : ajouter deux fois le même torrent renvoie le même
     * identifiant.
     *
     * @param magnetUri lien magnet (`magnet:?xt=urn:btih:…`) lu dans le catalogue autorisé, jamais fourni par un
     *                  utilisateur
     * @return l'identifiant du torrent (infohash)
     * @throws IllegalArgumentException si ce n'est pas un lien magnet {@code btih} : une URL ou un chemin de fichier
     *                                  serait suivi par le client (accès à des services internes)
     */
    String add(String magnetUri);

    /**
     * État courant d'un torrent.
     *
     * @return vide si le client ne connaît pas ce torrent (supprimé, redémarrage à vide)
     */
    Optional<TorrentStatus> status(String torrentId);

    /**
     * Annule un téléchargement et libère ses ressources. Un téléchargement non terminé perd ses données partielles ;
     * un torrent déjà terminé est retiré du client **sans effacer le fichier** (il peut être indexé dans Library).
     * Idempotent : un torrent inconnu est ignoré.
     */
    void cancel(String torrentId);
}
