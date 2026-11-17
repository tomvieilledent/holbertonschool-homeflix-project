package com.homeflix.library.files;

/** Chemin refusé : il sort de la racine autorisée (traversée, chemin absolu, lien symbolique sortant). */
public class UnsafePathException extends RuntimeException {

    public UnsafePathException(String message) {
        super(message);
    }
}
