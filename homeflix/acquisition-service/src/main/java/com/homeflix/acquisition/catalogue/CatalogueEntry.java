package com.homeflix.acquisition.catalogue;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Contenu autorisé au téléchargement. Une entrée n'existe que si sa licence et la preuve de cette licence sont
 * documentées (contraintes NOT NULL et non vide en base). Le lien magnet et l'empreinte restent côté serveur :
 * ils ne sont jamais renvoyés par l'API.
 */
@Entity
@Table(name = "catalogue_entries")
public class CatalogueEntry {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String source;

    @Column(nullable = false)
    private String license;

    @Column(name = "license_proof_url", nullable = false)
    private String licenseProofUrl;

    @Column(name = "magnet_uri", nullable = false)
    private String magnetUri;

    @Column(nullable = false, unique = true)
    private String infohash;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected CatalogueEntry() {
    }

    public CatalogueEntry(String title, String source, String license, String licenseProofUrl, String magnetUri,
            String infohash, long sizeBytes) {
        this.id = UUID.randomUUID();
        this.title = title;
        this.source = source;
        this.license = license;
        this.licenseProofUrl = licenseProofUrl;
        this.magnetUri = magnetUri;
        this.infohash = infohash;
        this.sizeBytes = sizeBytes;
    }

    public UUID getId() { return id; }
    public String getTitle() { return title; }
    public String getSource() { return source; }
    public String getLicense() { return license; }
    public String getLicenseProofUrl() { return licenseProofUrl; }
    public String getMagnetUri() { return magnetUri; }
    public String getInfohash() { return infohash; }
    public long getSizeBytes() { return sizeBytes; }
    public Instant getCreatedAt() { return createdAt; }
}
