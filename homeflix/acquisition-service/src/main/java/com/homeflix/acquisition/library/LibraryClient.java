package com.homeflix.acquisition.library;

import java.util.Collection;
import java.util.Set;
import java.util.UUID;

/**
 * Appels internes vers Library (`/internal/downloads…`). Secret partagé `X-Internal-Key`, jamais routé par
 * le reverse proxy. Une panne se traduit par {@link LibraryUnavailableException}, un refus par
 * {@link LibraryRejectedException}.
 */
public interface LibraryClient {

    /**
     * Déclare un fichier terminé : Library l'indexe et le rend disponible au catalogue.
     *
     * @param relativePath chemin relatif au dossier de téléchargements (`/downloads`)
     * @param title        titre affiché (issu du catalogue autorisé)
     * @throws LibraryUnavailableException si Library est injoignable, trop lente ou en erreur
     * @return l'identifiant du média dans Library
     * @throws LibraryRejectedException    si Library refuse la requête
     */
    UUID registerCompleted(String relativePath, String title);

    /**
     * Parmi ces médias, ceux qui sont encore disponibles dans la bibliothèque. Un seul essai : l'appel accompagne une
     * requête de l'utilisateur.
     */
    Set<UUID> present(Collection<UUID> mediaIds);

    /** Signale un fichier en cours de téléchargement : le catalogue l'affiche « en téléchargement ». */
    void registerDownloading(String relativePath, String title);

    /** Retire cet état après un échec ou une annulation. */
    void registerFailed(String relativePath);
}
