package com.homeflix.library.poster;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Locale;
import java.util.UUID;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.homeflix.library.api.ApiException;
import com.homeflix.library.files.SafePathResolver;
import com.homeflix.library.media.MediaMetadata;
import com.homeflix.library.media.MediaMetadataRepository;

/** Sert l'affiche d'un film à partir d'une adresse signée ; le fichier doit rester dans son dossier autorisé. */
@RestController
@RequestMapping("/api/v1/posters")
public class PosterController {

    private final PosterLinks links;
    private final MediaMetadataRepository metadata;
    private final SafePathResolver resolver;

    public PosterController(PosterLinks links, MediaMetadataRepository metadata, SafePathResolver resolver) {
        this.links = links;
        this.metadata = metadata;
        this.resolver = resolver;
    }

    @GetMapping("/{mediaId}")
    public ResponseEntity<Resource> poster(@PathVariable UUID mediaId,
            @RequestParam(name = "e", defaultValue = "0") long expires,
            @RequestParam(name = "s", required = false) String signature) {
        if (!links.isValid(mediaId, expires, signature)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "ACCESS_DENIED", "Accès refusé",
                    "Adresse d'affiche invalide ou expirée.");
        }
        Path file = locate(mediaId);
        String name = file.getFileName().toString().toLowerCase(Locale.ROOT);
        return ResponseEntity.ok()
                .contentType(name.endsWith(".png") ? MediaType.IMAGE_PNG : MediaType.IMAGE_JPEG)
                .cacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePrivate())
                .body(new FileSystemResource(file));
    }

    private Path locate(UUID mediaId) {
        MediaMetadata found = metadata.findWithRoot(mediaId)
                .orElseThrow(() -> ApiException.notFound("Affiche introuvable."));
        try {
            Path file = resolver.resolveInside(Path.of(found.getMedia().getRoot().getPath()), found.getPosterPath());
            // Un lien symbolique peut viser un autre fichier du dossier : seule une image est servie.
            if (Files.isRegularFile(file) && Files.isReadable(file)
                    && file.getFileName().toString().toLowerCase(Locale.ROOT).matches(".*\\.(jpg|jpeg|png)")) {
                return file;
            }
        } catch (IOException | RuntimeException e) {
            // fichier disparu, illisible ou hors racine : même réponse, sans chemin
        }
        throw ApiException.notFound("Affiche introuvable.");
    }
}
