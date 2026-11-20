package com.homeflix.library.index;

import java.nio.file.Path;
import java.util.Locale;
import java.util.Set;

/** Règles de détection des vidéos : extension reconnue et titre dérivé du nom de fichier. */
public final class VideoFiles {

    /** mp4 est le format documenté ; mkv et webm sont indexés mais la lecture n'est pas garantie par tous les navigateurs. */
    static final Set<String> EXTENSIONS = Set.of("mp4", "mkv", "webm");

    private static final int MAX_TITLE = 200;

    private VideoFiles() {
    }

    public static boolean isVideo(Path file) {
        String name = file.getFileName().toString();
        if (name.startsWith(".")) {
            return false; // fichiers cachés et métadonnées système (« ._film.mp4 » de macOS)
        }
        int dot = name.lastIndexOf('.');
        return dot > 0 && EXTENSIONS.contains(name.substring(dot + 1).toLowerCase(Locale.ROOT));
    }

    /** « big_buck_bunny.2008.mp4 » devient « big buck bunny 2008 » : le nom sans extension, séparateurs en espaces. */
    public static String titleFrom(String relativePath) {
        String name = relativePath.substring(relativePath.lastIndexOf('/') + 1);
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name;
        String title = base.replaceAll("[._]+", " ").replaceAll("\\s+", " ").trim();
        if (title.isEmpty()) {
            title = base;
        }
        return title.length() > MAX_TITLE ? title.substring(0, MAX_TITLE) : title;
    }
}
