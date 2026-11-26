package com.homeflix.library.poster;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

/** Affiche d'un film : une image de même nom, dans le même dossier (`film.mp4` → `film.jpg`). */
public final class PosterFiles {

    private static final List<String> EXTENSIONS = List.of("jpg", "jpeg", "png");

    private PosterFiles() { }

    /** Chemin de l'image relatif à la racine, si elle existe à côté de la vidéo. */
    public static Optional<String> besideVideo(Path realRoot, String videoRelativePath) {
        int dot = videoRelativePath.lastIndexOf('.');
        String base = dot > 0 ? videoRelativePath.substring(0, dot) : videoRelativePath;
        return EXTENSIONS.stream()
                .map(extension -> base + "." + extension)
                .filter(candidate -> Files.isRegularFile(realRoot.resolve(candidate)))
                .findFirst();
    }
}
