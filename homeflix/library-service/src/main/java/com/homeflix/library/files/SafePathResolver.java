package com.homeflix.library.files;

import java.io.IOException;
import java.nio.file.Path;

import org.springframework.stereotype.Component;

/**
 * Résolution sûre d'un chemin relatif sous une racine autorisée : tout accès à un fichier de la
 * bibliothèque passe par ici (protection contre le path traversal).
 *
 * <p>Le client n'envoie jamais de chemin : il fournit un identifiant de média, et le serveur
 * retrouve le chemin relatif en base. Cette classe reste la dernière barrière, même si une valeur
 * inattendue arrive en base.
 */
@Component
public class SafePathResolver {

    /**
     * @param root         racine autorisée (doit exister)
     * @param relativePath chemin relatif à la racine
     * @return le chemin réel (liens symboliques résolus), garanti à l'intérieur de la racine
     * @throws UnsafePathException si le chemin sort de la racine
     * @throws java.nio.file.NoSuchFileException si le fichier n'existe pas
     * @throws IOException pour toute autre erreur d'accès
     */
    public Path resolveInside(Path root, String relativePath) throws IOException {
        if (relativePath == null || relativePath.isBlank()) {
            throw new UnsafePathException("Chemin vide");
        }
        if (relativePath.indexOf('\0') >= 0) {
            throw new UnsafePathException("Caractère interdit dans le chemin");
        }
        if (relativePath.startsWith("/") || relativePath.startsWith("\\")) {
            throw new UnsafePathException("Chemin absolu refusé");
        }
        for (String segment : relativePath.split("[/\\\\]")) {
            if (segment.equals("..")) {
                throw new UnsafePathException("Segment « .. » refusé");
            }
        }

        Path realRoot = root.toRealPath();
        Path candidate = realRoot.resolve(relativePath).normalize();
        if (!candidate.startsWith(realRoot)) {
            throw new UnsafePathException("Le chemin sort de la racine");
        }
        // toRealPath() suit les liens symboliques : un lien qui pointe hors de la racine est refusé.
        Path real = candidate.toRealPath();
        if (!real.startsWith(realRoot)) {
            throw new UnsafePathException("Lien symbolique hors de la racine");
        }
        return real;
    }
}
