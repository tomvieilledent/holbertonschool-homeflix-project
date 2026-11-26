package com.homeflix.acquisition.library;

/** Library répond mais refuse la requête (4xx) : fichier non pris en charge, dossier non déclaré, secret invalide. */
public class LibraryRejectedException extends RuntimeException {

    public LibraryRejectedException() {
        super("Library a refusé la requête");
    }
}
