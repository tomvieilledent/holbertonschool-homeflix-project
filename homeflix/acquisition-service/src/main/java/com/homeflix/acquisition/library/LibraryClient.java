package com.homeflix.acquisition.library;

/**
 * Appels internes vers Library (`/internal/downloads/completed`). Secret partagé `X-Internal-Key`, jamais routé par
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
     * @throws LibraryRejectedException    si Library refuse la requête
     */
    void registerCompleted(String relativePath, String title);
}
