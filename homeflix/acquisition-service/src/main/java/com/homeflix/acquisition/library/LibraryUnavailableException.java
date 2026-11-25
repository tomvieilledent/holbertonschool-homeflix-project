package com.homeflix.acquisition.library;

/** Library injoignable, trop lente ou en erreur après les nouvelles tentatives. Sans détail technique. */
public class LibraryUnavailableException extends RuntimeException {

    public LibraryUnavailableException() {
        super("Library indisponible");
    }
}
