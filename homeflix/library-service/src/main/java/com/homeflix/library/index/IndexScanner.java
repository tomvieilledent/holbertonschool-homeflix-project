package com.homeflix.library.index;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.homeflix.library.files.SafePathResolver;
import com.homeflix.library.media.MediaRoot;
import com.homeflix.library.media.MediaRootRepository;
import com.homeflix.library.poster.PosterFiles;

/** Parcourt les dossiers autorisés actifs et synchronise le catalogue. Lecture seule sur les fichiers. */
@Component
public class IndexScanner {

    private static final Logger log = LoggerFactory.getLogger(IndexScanner.class);

    private final MediaRootRepository roots;
    private final IndexWriter writer;
    private final SafePathResolver resolver;

    public IndexScanner(MediaRootRepository roots, IndexWriter writer, SafePathResolver resolver) {
        this.roots = roots;
        this.writer = writer;
        this.resolver = resolver;
    }

    public void scan(IndexJob job) {
        Set<Path> seenRealPaths = new HashSet<>();
        for (MediaRoot root : roots.findByRemovedFalseOrderByCreatedAtAsc()) {
            if (root.isEnabled()) {
                scanRoot(root, job, seenRealPaths);
            }
        }
    }

    private void scanRoot(MediaRoot root, IndexJob job, Set<Path> seenRealPaths) {
        Path realRoot;
        try {
            realRoot = Path.of(root.getPath()).toRealPath();
        } catch (IOException e) {
            // Dossier absent ou démonté : on le signale et ses médias deviennent indisponibles.
            log.warn("Dossier inaccessible : {}", root.getPath(), e);
            job.error();
            job.markedUnavailable(writer.markMissing(root.getId(), Set.of(), Set.of()));
            return;
        }

        Set<UUID> seen = new HashSet<>();
        // Fichiers présents mais dont le traitement a échoué : leur état en base ne doit pas changer.
        Set<String> failed = new HashSet<>();
        try {
            // Les liens symboliques ne sont pas suivis par le parcours : chaque fichier est résolu par SafePathResolver.
            Files.walkFileTree(realRoot, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    if (VideoFiles.isVideo(file)) {
                        indexFile(root, realRoot, file, job, seenRealPaths, seen, failed);
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFileFailed(Path file, IOException e) {
                    log.warn("Élément illisible : {}", file, e);
                    job.error();
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException | RuntimeException e) {
            // Parcours interrompu : on n'affirme pas que les fichiers non vus ont disparu.
            log.error("Parcours interrompu pour {}", root.getPath(), e);
            job.error();
            return;
        }
        job.markedUnavailable(writer.markMissing(root.getId(), seen, failed));
    }

    private void indexFile(MediaRoot root, Path realRoot, Path file, IndexJob job, Set<Path> seenRealPaths, Set<UUID> seen,
            Set<String> failed) {
        job.scanned();
        String relative = realRoot.relativize(file).toString().replace('\\', '/');
        try {
            Path real = resolver.resolveInside(realRoot, relative);
            if (!Files.isRegularFile(real)) {
                return;
            }
            if (!seenRealPaths.add(real)) {
                job.duplicate(); // même fichier atteint deux fois (lien symbolique, dossiers imbriqués)
                return;
            }
            BasicFileAttributes attrs = Files.readAttributes(real, BasicFileAttributes.class);
            IndexWriter.Outcome outcome = writer.upsert(root.getId(), relative, attrs.size(),
                    attrs.lastModifiedTime().toInstant().truncatedTo(ChronoUnit.MILLIS), Mp4Duration.read(real));
            seen.add(outcome.mediaId());
            if (outcome.result() != IndexWriter.Result.SKIPPED) {
                writer.setPoster(outcome.mediaId(), PosterFiles.besideVideo(realRoot, relative).orElse(null));
            }
            switch (outcome.result()) {
                case ADDED -> job.added();
                case UPDATED -> job.updated();
                default -> { }
            }
        } catch (IOException | RuntimeException e) {
            log.warn("Fichier ignoré : {}", file, e);
            failed.add(relative); // présent sur le disque : ne pas le déclarer indisponible
            job.error();
        }
    }
}
