package com.homeflix.library.media;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** Fichier vidéo du catalogue. L'identité d'un fichier est le couple (racine, chemin relatif). */
@Entity
@Table(name = "media_items")
public class MediaItem {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "root_id", nullable = false)
    private MediaRoot root;

    @Column(name = "relative_path", nullable = false)
    private String relativePath;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "file_mtime", nullable = false)
    private Instant fileMtime;

    @Column(nullable = false)
    private String fingerprint;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Availability availability = Availability.AVAILABLE;

    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt;

    @Column(nullable = false)
    private boolean deleted = false;

    @Column(name = "added_at", nullable = false)
    private Instant addedAt = Instant.now();

    protected MediaItem() {
    }

    public MediaItem(MediaRoot root, String relativePath, long sizeBytes, Instant fileMtime, String fingerprint) {
        this.id = UUID.randomUUID();
        this.root = root;
        this.relativePath = relativePath;
        this.sizeBytes = sizeBytes;
        this.fileMtime = fileMtime;
        this.fingerprint = fingerprint;
        this.lastSeenAt = Instant.now();
    }

    public UUID getId() { return id; }
    public MediaRoot getRoot() { return root; }
    public String getRelativePath() { return relativePath; }
    public long getSizeBytes() { return sizeBytes; }
    public void setSizeBytes(long sizeBytes) { this.sizeBytes = sizeBytes; }
    public Instant getFileMtime() { return fileMtime; }
    public void setFileMtime(Instant fileMtime) { this.fileMtime = fileMtime; }
    public String getFingerprint() { return fingerprint; }
    public void setFingerprint(String fingerprint) { this.fingerprint = fingerprint; }
    public Availability getAvailability() { return availability; }
    public void setAvailability(Availability availability) { this.availability = availability; }
    public Instant getLastSeenAt() { return lastSeenAt; }
    public void setLastSeenAt(Instant lastSeenAt) { this.lastSeenAt = lastSeenAt; }
    public boolean isDeleted() { return deleted; }
    public void setDeleted(boolean deleted) { this.deleted = deleted; }
    public Instant getAddedAt() { return addedAt; }
}
