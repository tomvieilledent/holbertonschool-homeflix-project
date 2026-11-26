package com.homeflix.library.catalogue;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import com.homeflix.library.poster.PosterLinks;

/**
 * Lecture du catalogue en SQL paramétré. Seules des constantes (jamais une valeur du client) sont concaténées
 * au texte SQL : les valeurs passent par des paramètres liés, le tri par une liste blanche.
 */
@Repository
public class MediaCatalogueRepository {

    /** Tris autorisés : la clé est celle de l'API, la valeur est la clause SQL (constante). */
    enum Sort {
        ADDED_AT_DESC("i.added_at DESC"),
        TITLE_ASC("normalize_search(m.title) ASC"),
        YEAR_DESC("m.year DESC NULLS LAST");

        final String sql;

        Sort(String sql) {
            this.sql = sql;
        }
    }

    record Filter(String query, String genre, String availability) {
    }

    private static final String SELECT = """
        SELECT i.id, m.title, m.description, m.poster_path, m.genres, m.year, m.duration_seconds,
               i.availability, i.added_at
        FROM media_items i JOIN media_metadata m ON m.media_id = i.id
        """;

    private final RowMapper<MediaView> mapper = this::map;
    private final PosterLinks posters;

    private final NamedParameterJdbcTemplate jdbc;

    public MediaCatalogueRepository(NamedParameterJdbcTemplate jdbc, PosterLinks posters) {
        this.jdbc = jdbc;
        this.posters = posters;
    }

    List<MediaView> search(Filter filter, Sort sort, int limit, long offset) {
        MapSqlParameterSource params = new MapSqlParameterSource();
        String where = where(filter, params);
        params.addValue("limit", limit).addValue("offset", offset);
        return jdbc.query(SELECT + where + " ORDER BY " + sort.sql + ", i.id LIMIT :limit OFFSET :offset", params, mapper);
    }

    long count(Filter filter) {
        MapSqlParameterSource params = new MapSqlParameterSource();
        String where = where(filter, params);
        Long total = jdbc.queryForObject(
            "SELECT count(*) FROM media_items i JOIN media_metadata m ON m.media_id = i.id" + where, params, Long.class);
        return total == null ? 0 : total;
    }

    public Optional<MediaView> findById(UUID id) {
        return jdbc.query(SELECT + " WHERE i.deleted = false AND i.id = :id", new MapSqlParameterSource("id", id), mapper)
            .stream().findFirst();
    }

    /** « Ma liste » d'un profil : médias non retirés, ajoutés en dernier en premier. */
    public List<MediaView> findFavourites(UUID profileId, int limit, long offset) {
        return jdbc.query(SELECT + " JOIN favourites f ON f.media_id = i.id"
            + " WHERE i.deleted = false AND f.profile_id = :profileId"
            + " ORDER BY f.added_at DESC, i.id LIMIT :limit OFFSET :offset",
            new MapSqlParameterSource("profileId", profileId).addValue("limit", limit).addValue("offset", offset), mapper);
    }

    public long countFavourites(UUID profileId) {
        Long total = jdbc.queryForObject("""
            SELECT count(*) FROM favourites f JOIN media_items i ON i.id = f.media_id
            WHERE i.deleted = false AND f.profile_id = :profileId""", new MapSqlParameterSource("profileId", profileId), Long.class);
        return total == null ? 0 : total;
    }

    /** Titre commencé par un profil : le média et sa progression (voir `ContinueWatching`). */
    public record ContinueWatching(MediaView media, int positionSeconds, int durationSeconds, String state,
            Instant updatedAt) {
    }

    /** Un média dans la section d'un genre. */
    public record GenreEntry(String genre, MediaView media) {
    }

    /** Titres de ce profil à l'état STARTED (médias non retirés), dernière lecture en premier. */
    public List<ContinueWatching> findContinueWatching(UUID profileId, int limit) {
        return jdbc.query("""
            SELECT i.id, m.title, m.description, m.poster_path, m.genres, m.year, m.duration_seconds,
                   i.availability, i.added_at,
                   p.position_seconds AS p_position, p.duration_seconds AS p_duration, p.state AS p_state,
                   p.updated_at AS p_updated
            FROM progress p
            JOIN media_items i ON i.id = p.media_id
            JOIN media_metadata m ON m.media_id = i.id
            WHERE p.profile_id = :profileId AND p.state = 'STARTED' AND i.deleted = false
            ORDER BY p.updated_at DESC, i.id LIMIT :limit""",
            new MapSqlParameterSource("profileId", profileId).addValue("limit", limit),
            (rs, row) -> new ContinueWatching(map(rs, row), rs.getInt("p_position"), rs.getInt("p_duration"),
                rs.getString("p_state"), rs.getTimestamp("p_updated").toInstant()));
    }

    /** Médias disponibles, ajoutés en dernier en premier. */
    public List<MediaView> findRecentlyAdded(int limit) {
        return jdbc.query(SELECT + " WHERE i.deleted = false AND i.availability = 'AVAILABLE'"
            + " ORDER BY i.added_at DESC, i.id LIMIT :limit", new MapSqlParameterSource("limit", limit), mapper);
    }

    /** Pour chaque genre ayant au moins un média disponible, ses `perGenre` médias les plus récents (une seule requête). */
    public List<GenreEntry> findByGenre(int perGenre) {
        return jdbc.query("""
            SELECT * FROM (
                SELECT g AS genre, i.id, m.title, m.description, m.poster_path, m.genres, m.year, m.duration_seconds,
                       i.availability, i.added_at,
                       row_number() OVER (PARTITION BY g ORDER BY i.added_at DESC, i.id) AS rn
                FROM media_items i JOIN media_metadata m ON m.media_id = i.id, unnest(m.genres) AS g
                WHERE i.deleted = false AND i.availability = 'AVAILABLE') t
            WHERE rn <= :perGenre ORDER BY genre, rn""",
            new MapSqlParameterSource("perGenre", perGenre),
            (rs, row) -> new GenreEntry(rs.getString("genre"), map(rs, row)));
    }

    /** Genres d'au moins un média disponible (les entrées retirées ne comptent pas). */
    public List<String> genres() {
        return jdbc.getJdbcOperations().queryForList("""
            SELECT DISTINCT g FROM media_items i
            JOIN media_metadata m ON m.media_id = i.id, unnest(m.genres) AS g
            WHERE i.deleted = false AND i.availability = 'AVAILABLE'
            ORDER BY g""", String.class);
    }

    private static String where(Filter f, MapSqlParameterSource params) {
        StringBuilder sql = new StringBuilder(" WHERE i.deleted = false");
        if (f.query() != null) {
            sql.append(" AND normalize_search(m.title) LIKE '%' || normalize_search(:q) || '%' ESCAPE '\\'");
            params.addValue("q", escapeLike(f.query()));
        }
        if (f.genre() != null) {
            sql.append(" AND EXISTS (SELECT 1 FROM unnest(m.genres) g WHERE normalize_search(g) = normalize_search(:genre))");
            params.addValue("genre", f.genre());
        }
        if (f.availability() != null) {
            sql.append(" AND i.availability = :availability");
            params.addValue("availability", f.availability());
        }
        return sql.toString();
    }

    /** Neutralise les jokers LIKE de la saisie : « % » et « _ » sont cherchés littéralement. */
    static String escapeLike(String input) {
        return input.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private MediaView map(ResultSet rs, int row) throws SQLException {
        Array genres = rs.getArray("genres");
        List<String> list = genres == null ? new ArrayList<>() : Arrays.asList((String[]) genres.getArray());
        int year = rs.getInt("year");
        Integer yearValue = rs.wasNull() ? null : year;
        int duration = rs.getInt("duration_seconds");
        Integer durationValue = rs.wasNull() ? null : duration;
        UUID id = rs.getObject("id", UUID.class);
        return new MediaView(id, rs.getString("title"), rs.getString("description"),
            rs.getString("poster_path") == null ? null : posters.url(id), // jamais le chemin disque
            list, yearValue, durationValue, rs.getString("availability"),
            rs.getTimestamp("added_at").toInstant());
    }
}
