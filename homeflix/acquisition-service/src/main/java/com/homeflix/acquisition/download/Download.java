package com.homeflix.acquisition.download;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Téléchargement demandé par un administrateur. `requestedBy` est le compte d'Identity (aucune clé étrangère) ;
 * `torrentId` est l'identifiant du client BitTorrent et ne sort jamais de ce service.
 */
@Entity
@Table(name = "downloads")
public class Download {

    @Id
    private UUID id;

    @Column(name = "entry_id", nullable = false)
    private UUID entryId;

    @Column(name = "requested_by", nullable = false)
    private UUID requestedBy;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DownloadState state = DownloadState.QUEUED;

    @Column(name = "progress_percent", nullable = false)
    private int progressPercent;

    @Column(name = "error_code")
    private String errorCode;

    @Column(name = "torrent_id")
    private String torrentId;

    @Column(name = "file_relative_path")
    private String fileRelativePath;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "finished_at")
    private Instant finishedAt;

    protected Download() {
    }

    public Download(UUID entryId, UUID requestedBy) {
        this.id = UUID.randomUUID();
        this.entryId = entryId;
        this.requestedBy = requestedBy;
    }

    public UUID getId() { return id; }
    public UUID getEntryId() { return entryId; }
    public UUID getRequestedBy() { return requestedBy; }
    public DownloadState getState() { return state; }
    public void setState(DownloadState state) { this.state = state; }
    public int getProgressPercent() { return progressPercent; }
    public void setProgressPercent(int progressPercent) { this.progressPercent = progressPercent; }
    public String getErrorCode() { return errorCode; }
    public void setErrorCode(String errorCode) { this.errorCode = errorCode; }
    public String getTorrentId() { return torrentId; }
    public void setTorrentId(String torrentId) { this.torrentId = torrentId; }
    public String getFileRelativePath() { return fileRelativePath; }
    public void setFileRelativePath(String fileRelativePath) { this.fileRelativePath = fileRelativePath; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getFinishedAt() { return finishedAt; }
    public void setFinishedAt(Instant finishedAt) { this.finishedAt = finishedAt; }
}
