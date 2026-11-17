package com.homeflix.library.media;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;

/** Métadonnées d'un média ; `edited` protège les corrections de l'administrateur contre l'indexation. */
@Entity
@Table(name = "media_metadata")
public class MediaMetadata {

    @Id
    @Column(name = "media_id")
    private UUID id;

    @OneToOne(optional = false)
    @MapsId
    @JoinColumn(name = "media_id")
    private MediaItem media;

    @Column(nullable = false)
    private String title;

    private String description;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(nullable = false, columnDefinition = "text[]")
    private List<String> genres = new ArrayList<>();

    private Integer year;

    @Column(name = "duration_seconds")
    private Integer durationSeconds;

    @Column(name = "poster_path")
    private String posterPath;

    @Column(nullable = false)
    private boolean edited = false;

    protected MediaMetadata() {
    }

    public MediaMetadata(MediaItem media, String title) {
        this.media = media;
        this.title = title;
    }

    public UUID getId() { return id; }
    public MediaItem getMedia() { return media; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public List<String> getGenres() { return genres; }
    public void setGenres(List<String> genres) { this.genres = genres; }
    public Integer getYear() { return year; }
    public void setYear(Integer year) { this.year = year; }
    public Integer getDurationSeconds() { return durationSeconds; }
    public void setDurationSeconds(Integer durationSeconds) { this.durationSeconds = durationSeconds; }
    public String getPosterPath() { return posterPath; }
    public void setPosterPath(String posterPath) { this.posterPath = posterPath; }
    public boolean isEdited() { return edited; }
    public void setEdited(boolean edited) { this.edited = edited; }
}
