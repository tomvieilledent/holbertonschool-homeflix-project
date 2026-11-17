package com.homeflix.library.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.homeflix.library.viewing.Favourite;
import com.homeflix.library.viewing.FavouriteRepository;
import com.homeflix.library.viewing.Progress;
import com.homeflix.library.viewing.ProgressRepository;
import com.homeflix.library.viewing.ProgressState;

/**
 * Migrations Flyway, entités et repositories de Library sur un vrai PostgreSQL (Testcontainers).
 * Le démarrage du contexte vérifie aussi `ddl-auto=validate` : les entités correspondent au schéma.
 */
@SpringBootTest
@Testcontainers
class PersistenceIntegrationTests {

	@Container
	static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

	@DynamicPropertySource
	static void properties(DynamicPropertyRegistry registry) {
		registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
		registry.add("spring.datasource.username", POSTGRES::getUsername);
		registry.add("spring.datasource.password", POSTGRES::getPassword);
		registry.add("identity.jwks-uri", () -> "http://identity-service:8081/.well-known/jwks.json");
	}

	@Autowired MediaRootRepository roots;
	@Autowired MediaItemRepository items;
	@Autowired MediaMetadataRepository metadata;
	@Autowired FavouriteRepository favourites;
	@Autowired ProgressRepository progress;
	@Autowired JdbcTemplate jdbc;

	@AfterEach
	void clean() {
		jdbc.update("delete from progress");
		jdbc.update("delete from favourites");
		jdbc.update("delete from media_metadata");
		jdbc.update("delete from media_items");
		jdbc.update("delete from media_roots");
	}

	private MediaRoot newRoot(String path) {
		return roots.save(new MediaRoot(path, "Films"));
	}

	private MediaItem newItem(MediaRoot root, String relativePath) {
		return items.save(new MediaItem(root, relativePath, 1_000L, Instant.now(), "fp-" + relativePath));
	}

	private int insertItem(UUID rootId, String relativePath, String availability) {
		return jdbc.update("""
				insert into media_items (id, root_id, relative_path, size_bytes, file_mtime, fingerprint, availability, last_seen_at)
				values (?, ?, ?, 1, now(), 'fp', ?, now())""", UUID.randomUUID(), rootId, relativePath, availability);
	}

	@Test
	void migrationCreatesTheFiveTables() {
		List<String> tables = jdbc.queryForList("""
				select table_name from information_schema.tables
				where table_schema = 'public' and table_name in
				('media_roots', 'media_items', 'media_metadata', 'favourites', 'progress')""", String.class);
		assertThat(tables).hasSize(5);
	}

	@Test
	void aFileIsUniquePerRootAndRelativePath() {
		MediaRoot root = newRoot("/media");
		newItem(root, "films/a.mp4");

		assertThatThrownBy(() -> newItem(root, "films/a.mp4")).isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void theSameRelativePathIsAllowedInAnotherRoot() {
		newItem(newRoot("/media"), "films/a.mp4");
		newItem(newRoot("/downloads"), "films/a.mp4");

		assertThat(items.count()).isEqualTo(2);
	}

	@Test
	void aRootPathIsUnique() {
		newRoot("/media");

		assertThatThrownBy(() -> newRoot("/media")).isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void aRootPathMustBeAbsolute() {
		assertThatThrownBy(() -> newRoot("media")).isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void availabilityOnlyAcceptsKnownValues() {
		UUID rootId = newRoot("/media").getId();

		assertThat(insertItem(rootId, "ok.mp4", "UNAVAILABLE")).isEqualTo(1);
		assertThatThrownBy(() -> insertItem(rootId, "bad.mp4", "BROKEN")).isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void relativePathsCannotEscapeTheRoot() {
		UUID rootId = newRoot("/media").getId();

		for (String bad : List.of("../secret.mp4", "a/../../b.mp4", "/etc/passwd", "..", "")) {
			assertThatThrownBy(() -> insertItem(rootId, bad, "AVAILABLE"))
					.as("chemin refusé : '%s'", bad)
					.isInstanceOf(DataIntegrityViolationException.class);
		}
		assertThat(insertItem(rootId, "films/a..b.mp4", "AVAILABLE")).isEqualTo(1);
	}

	@Test
	void metadataKeepsItsGenres() {
		MediaItem item = newItem(newRoot("/media"), "films/sintel.mp4");
		MediaMetadata data = new MediaMetadata(item, "Sintel");
		data.setGenres(List.of("Fantastique", "Animation"));
		data.setYear(2010);
		metadata.save(data);

		MediaMetadata reloaded = metadata.findById(item.getId()).orElseThrow();
		assertThat(reloaded.getTitle()).isEqualTo("Sintel");
		assertThat(reloaded.getGenres()).containsExactly("Fantastique", "Animation");
		assertThat(reloaded.isEdited()).isFalse();
	}

	@Test
	void anItemIsFoundByRootAndPathAndByFingerprint() {
		MediaRoot root = newRoot("/media");
		MediaItem item = newItem(root, "films/a.mp4");

		assertThat(items.findByRootIdAndRelativePath(root.getId(), "films/a.mp4")).isPresent();
		assertThat(items.findByRootIdAndRelativePath(root.getId(), "films/b.mp4")).isEmpty();
		assertThat(items.findByFingerprint(item.getFingerprint())).hasSize(1);
	}

	@Test
	void deletingAMediaRemovesItsMetadataFavouritesAndProgress() {
		MediaItem item = newItem(newRoot("/media"), "films/a.mp4");
		UUID account = UUID.randomUUID();
		UUID profile = UUID.randomUUID();
		metadata.save(new MediaMetadata(item, "A"));
		favourites.save(new Favourite(account, profile, item));
		progress.save(new Progress(account, profile, item));

		jdbc.update("delete from media_items where id = ?", item.getId());

		assertThat(metadata.count()).isZero();
		assertThat(favourites.count()).isZero();
		assertThat(progress.count()).isZero();
	}

	@Test
	void favouritesAndProgressStayIsolatedBetweenProfiles() {
		MediaItem item = newItem(newRoot("/media"), "films/a.mp4");
		UUID account = UUID.randomUUID();
		UUID profileA = UUID.randomUUID();
		UUID profileB = UUID.randomUUID();
		favourites.save(new Favourite(account, profileA, item));
		Progress started = new Progress(account, profileA, item);
		started.update(120, 900, ProgressState.STARTED);
		progress.save(started);

		assertThat(favourites.findByIdProfileId(profileA)).hasSize(1);
		assertThat(favourites.findByIdProfileId(profileB)).isEmpty();
		assertThat(progress.findByIdProfileId(profileA)).singleElement()
				.satisfies(p -> {
					assertThat(p.getPositionSeconds()).isEqualTo(120);
					assertThat(p.getState()).isEqualTo(ProgressState.STARTED);
				});
		assertThat(progress.findByIdProfileId(profileB)).isEmpty();
	}

	@Test
	void aProfileHasOneFavouriteAndOneProgressRowPerMedia() {
		MediaItem item = newItem(newRoot("/media"), "films/a.mp4");
		UUID account = UUID.randomUUID();
		UUID profile = UUID.randomUUID();
		jdbc.update("insert into favourites (account_id, profile_id, media_id) values (?, ?, ?)", account, profile, item.getId());
		jdbc.update("insert into progress (account_id, profile_id, media_id) values (?, ?, ?)", account, profile, item.getId());

		assertThatThrownBy(() -> jdbc.update("insert into favourites (account_id, profile_id, media_id) values (?, ?, ?)",
				account, profile, item.getId())).isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> jdbc.update("insert into progress (account_id, profile_id, media_id) values (?, ?, ?)",
				account, profile, item.getId())).isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void progressRejectsAnUnknownStateAndANegativePosition() {
		MediaItem item = newItem(newRoot("/media"), "films/a.mp4");
		UUID account = UUID.randomUUID();

		assertThatThrownBy(() -> jdbc.update("insert into progress (account_id, profile_id, media_id, state) values (?, ?, ?, 'BROKEN')",
				account, UUID.randomUUID(), item.getId())).isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> jdbc.update("insert into progress (account_id, profile_id, media_id, position_seconds) values (?, ?, ?, -1)",
				account, UUID.randomUUID(), item.getId())).isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void noTableReferencesAnotherServiceOrAnAccount() {
		List<String> referenced = jdbc.queryForList("""
				select distinct ccu.table_name
				from information_schema.table_constraints tc
				join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
				where tc.constraint_type = 'FOREIGN KEY' and tc.table_name in ('favourites', 'progress')""", String.class);

		assertThat(referenced).containsExactly("media_items");
	}
}
