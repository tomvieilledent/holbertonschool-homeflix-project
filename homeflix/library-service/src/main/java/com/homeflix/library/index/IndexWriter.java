package com.homeflix.library.index;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.homeflix.library.media.Availability;
import com.homeflix.library.media.MediaItem;
import com.homeflix.library.media.MediaItemRepository;
import com.homeflix.library.media.MediaMetadata;
import com.homeflix.library.media.MediaMetadataRepository;
import com.homeflix.library.media.MediaRoot;
import com.homeflix.library.media.MediaRootRepository;

/**
 * Écritures de l'indexation, une transaction par fichier : une erreur sur un fichier n'annule pas
 * le travail déjà fait sur les autres.
 */
@Component
public class IndexWriter {

    public enum Result { ADDED, UPDATED, UNCHANGED, SKIPPED }

    public record Outcome(Result result, UUID mediaId) { }

    private final MediaRootRepository roots;
    private final MediaItemRepository items;
    private final MediaMetadataRepository metadata;

    public IndexWriter(MediaRootRepository roots, MediaItemRepository items, MediaMetadataRepository metadata) {
        this.roots = roots;
        this.items = items;
        this.metadata = metadata;
    }

    /** Ajoute le fichier s'il est nouveau, met à jour l'entrée s'il a changé, sinon ne modifie que la date de passage. */
    @Transactional
    public Outcome upsert(UUID rootId, String relativePath, long size, Instant mtime) {
        Instant now = Instant.now();
        String fingerprint = fingerprint(size, mtime, relativePath);
        Optional<MediaItem> existing = items.findByRootIdAndRelativePath(rootId, relativePath);

        if (existing.isEmpty()) {
            MediaRoot root = roots.getReferenceById(rootId);
            MediaItem item = items.save(new MediaItem(root, relativePath, size, mtime, fingerprint));
            metadata.save(new MediaMetadata(item, VideoFiles.titleFrom(relativePath)));
            return new Outcome(Result.ADDED, item.getId());
        }

        MediaItem item = existing.get();
        if (item.isDeleted()) {
            return new Outcome(Result.SKIPPED, item.getId()); // retiré par l'administrateur : jamais réindexé
        }
        boolean changed = item.getSizeBytes() != size
                || !item.getFileMtime().equals(mtime)
                || item.getAvailability() == Availability.UNAVAILABLE;
        if (changed) {
            item.setSizeBytes(size);
            item.setFileMtime(mtime);
            item.setFingerprint(fingerprint);
            item.setAvailability(Availability.AVAILABLE);
        }
        item.setLastSeenAt(now);
        return new Outcome(changed ? Result.UPDATED : Result.UNCHANGED, item.getId());
    }

    /** Marque indisponibles les médias de la racine absents du scan ; aucun fichier n'est touché. */
    @Transactional
    public int markMissing(UUID rootId, Set<UUID> seen) {
        List<MediaItem> candidates = items.findByRootId(rootId);
        int count = 0;
        for (MediaItem item : candidates) {
            if (!item.isDeleted() && item.getAvailability() == Availability.AVAILABLE && !seen.contains(item.getId())) {
                item.setAvailability(Availability.UNAVAILABLE);
                count++;
            }
        }
        return count;
    }

    /** Empreinte (taille, date de modification, chemin relatif) : change dès que le fichier change. */
    static String fingerprint(long size, Instant mtime, String relativePath) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest((size + "|" + mtime.toEpochMilli() + "|" + relativePath)
                    .getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
