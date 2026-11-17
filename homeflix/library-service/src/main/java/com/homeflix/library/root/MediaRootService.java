package com.homeflix.library.root;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.homeflix.library.api.ApiException;
import com.homeflix.library.media.Availability;
import com.homeflix.library.media.MediaItemRepository;
import com.homeflix.library.media.MediaRoot;
import com.homeflix.library.media.MediaRootRepository;

/**
 * Gestion des dossiers autorisés. Un dossier n'est accepté que s'il existe, est un dossier lisible,
 * se trouve sous un emplacement autorisé (les montages du conteneur) et ne chevauche aucun autre
 * dossier : aucune lecture de fichier ne peut ensuite sortir de ces racines.
 */
@Service
public class MediaRootService {

    private static final String NOT_FOUND = "ROOT_NOT_FOUND";
    private static final String NOT_A_DIRECTORY = "ROOT_NOT_A_DIRECTORY";
    private static final String NOT_READABLE = "ROOT_NOT_READABLE";
    private static final String NOT_ALLOWED = "ROOT_NOT_ALLOWED";
    private static final String OVERLAP = "ROOT_OVERLAP";

    private final MediaRootRepository roots;
    private final MediaItemRepository items;
    private final List<Path> allowedBases;

    public MediaRootService(MediaRootRepository roots, MediaItemRepository items,
            @Value("${library.allowed-bases}") List<String> allowedBases) {
        this.roots = roots;
        this.items = items;
        this.allowedBases = allowedBases.stream().map(String::trim).filter(s -> !s.isEmpty())
                .map(s -> Path.of(s).normalize()).toList();
    }

    @Transactional(readOnly = true)
    public List<MediaRootResponse> list() {
        return roots.findByRemovedFalseOrderByCreatedAtAsc().stream().map(MediaRootResponse::from).toList();
    }

    /** Vérifie un chemin sans l'enregistrer ; ne lève jamais d'erreur métier, décrit le problème. */
    @Transactional(readOnly = true)
    public RootValidation validate(String rawPath) {
        return check(rawPath).validation();
    }

    @Transactional
    public MediaRootResponse create(MediaRootInput input) {
        Check check = check(input.path());
        if (!check.validation().valid()) {
            RootValidation v = check.validation();
            HttpStatus status = OVERLAP.equals(v.code()) ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST;
            throw new ApiException(status, v.code(), "Dossier refusé", v.message());
        }
        String label = input.label() == null || input.label().isBlank() ? defaultLabel(check.real()) : input.label().strip();
        MediaRoot root = roots.save(new MediaRoot(check.real().toString(), label));
        return MediaRootResponse.from(root);
    }

    @Transactional
    public MediaRootResponse update(UUID id, MediaRootPatch patch) {
        MediaRoot root = roots.findByIdAndRemovedFalse(id).orElseThrow(MediaRootService::notFound);
        if (patch.label() != null) {
            if (patch.label().isBlank()) {
                throw ApiException.validation("label", "Le libellé ne peut pas être vide");
            }
            root.setLabel(patch.label().strip());
        }
        if (patch.enabled() != null) {
            root.setEnabled(patch.enabled());
        }
        return MediaRootResponse.from(roots.save(root));
    }

    /** Retire le dossier : ses médias passent à UNAVAILABLE, aucun fichier n'est supprimé. */
    @Transactional
    public void remove(UUID id) {
        MediaRoot root = roots.findByIdAndRemovedFalse(id).orElseThrow(MediaRootService::notFound);
        items.updateAvailabilityByRootId(root.getId(), Availability.UNAVAILABLE);
        root.setRemoved(true);
        root.setEnabled(false);
        roots.save(root);
    }

    private static ApiException notFound() {
        return ApiException.notFound("Ce dossier n'existe pas ou a déjà été retiré.");
    }

    private static String defaultLabel(Path real) {
        Path name = real.getFileName();
        return name == null ? real.toString() : name.toString();
    }

    private record Check(Path real, RootValidation validation) { }

    private Check check(String rawPath) {
        // 1. Forme du chemin et emplacement autorisé, avant tout accès au disque (aucune sonde
        //    du système de fichiers du conteneur ne dépend de ce que l'administrateur saisit).
        if (rawPath == null || rawPath.isBlank() || rawPath.indexOf('\0') >= 0 || !rawPath.startsWith("/")) {
            return refused(NOT_ALLOWED, "Indiquez le chemin complet du dossier, par exemple /media/films.");
        }
        for (String segment : rawPath.split("/")) {
            if (segment.equals("..")) {
                return refused(NOT_ALLOWED, "Le chemin ne doit pas contenir « .. ».");
            }
        }
        Path path = Path.of(rawPath).normalize();
        if (!isUnderAllowedBase(path)) {
            return refused(NOT_ALLOWED, "Ce dossier n'est pas dans un emplacement autorisé : "
                    + "choisissez un dossier situé sous " + String.join(" ou ", allowedBases.stream().map(Path::toString).toList()) + ".");
        }

        // 2. Existence, type et droits.
        if (!Files.exists(path)) {
            return refused(NOT_FOUND, "Ce dossier est introuvable. Vérifiez le chemin et que le dossier est bien monté dans HomeFlix.");
        }
        if (!Files.isDirectory(path)) {
            return refused(NOT_A_DIRECTORY, "Ce chemin est un fichier, pas un dossier.");
        }
        if (!Files.isReadable(path) || !Files.isExecutable(path)) {
            return refused(NOT_READABLE, "HomeFlix n'a pas le droit de lire ce dossier. Vérifiez ses permissions.");
        }

        // 3. Chemin réel : un lien symbolique ne doit pas faire sortir de l'emplacement autorisé.
        Path real;
        try {
            real = path.toRealPath();
        } catch (IOException e) {
            return refused(NOT_READABLE, "HomeFlix n'a pas pu lire ce dossier. Vérifiez ses permissions.");
        }
        if (!isUnderRealAllowedBase(real)) {
            return refused(NOT_ALLOWED, "Ce dossier pointe en dehors des emplacements autorisés.");
        }

        // 4. Pas de chevauchement avec un dossier déjà configuré.
        for (MediaRoot other : roots.findByRemovedFalseOrderByCreatedAtAsc()) {
            Path otherPath = Path.of(other.getPath());
            if (real.startsWith(otherPath) || otherPath.startsWith(real)) {
                return refused(OVERLAP, "Ce dossier chevauche le dossier déjà configuré « " + other.getLabel() + " ».");
            }
        }
        return new Check(real, RootValidation.ok());
    }

    private boolean isUnderAllowedBase(Path path) {
        return allowedBases.stream().anyMatch(path::startsWith);
    }

    private boolean isUnderRealAllowedBase(Path real) {
        for (Path base : allowedBases) {
            try {
                if (real.startsWith(base.toRealPath())) {
                    return true;
                }
            } catch (IOException ignored) {
                // base absente (volume non monté) : elle ne peut pas autoriser ce chemin
            }
        }
        return false;
    }

    private static Check refused(String code, String message) {
        return new Check(null, RootValidation.invalid(code, message));
    }
}
