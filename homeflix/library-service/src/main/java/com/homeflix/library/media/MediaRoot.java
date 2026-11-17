package com.homeflix.library.media;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Dossier autorisé : seule racine sous laquelle Library lit des fichiers. */
@Entity
@Table(name = "media_roots")
public class MediaRoot {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String path;

    @Column(nullable = false)
    private String label;

    @Column(nullable = false)
    private boolean enabled = true;

    /** Suppression douce : un dossier retiré garde ses médias (UNAVAILABLE) et reste en base. */
    @Column(nullable = false)
    private boolean removed = false;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected MediaRoot() {
    }

    public MediaRoot(String path, String label) {
        this.id = UUID.randomUUID();
        this.path = path;
        this.label = label;
    }

    public UUID getId() { return id; }
    public String getPath() { return path; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public boolean isRemoved() { return removed; }
    public void setRemoved(boolean removed) { this.removed = removed; }
    public Instant getCreatedAt() { return createdAt; }
}
