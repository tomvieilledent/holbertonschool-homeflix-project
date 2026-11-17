package com.homeflix.library.index;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Indexation de bout en bout : HTTP, PostgreSQL réel, dossier temporaire réel. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class IndexApiIntegrationTests {

	private static final String INDEX = "/api/v1/admin/index";

	@Container
	static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

	@DynamicPropertySource
	static void properties(DynamicPropertyRegistry registry) {
		registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
		registry.add("spring.datasource.username", POSTGRES::getUsername);
		registry.add("spring.datasource.password", POSTGRES::getPassword);
		registry.add("identity.jwks-uri", () -> "http://identity-service:8081/.well-known/jwks.json");
	}

	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;
	@Autowired ObjectMapper json;
	@Autowired IndexWriter writer;

	Path root;
	UUID rootId;

	@BeforeEach
	void setUp() throws IOException {
		root = Files.createTempDirectory("homeflix-index-").toRealPath();
		rootId = UUID.randomUUID();
		jdbc.update("insert into media_roots (id, path, label) values (?, ?, 'test')", rootId, root.toString());
	}

	@AfterEach
	void clean() {
		jdbc.update("delete from media_items");
		jdbc.update("delete from media_roots");
	}

	private Path video(String relative, String content) throws IOException {
		Path file = root.resolve(relative);
		Files.createDirectories(file.getParent());
		Files.writeString(file, content);
		return file;
	}

	/** Lance un scan et attend sa fin. */
	private JsonNode scan() throws Exception {
		mvc.perform(post(INDEX).with(user("admin").roles("ADMIN"))).andExpect(status().isAccepted());
		for (int i = 0; i < 200; i++) {
			String body = mvc.perform(get(INDEX + "/status").with(user("admin").roles("ADMIN")))
					.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
			JsonNode status = json.readTree(body);
			if (!"RUNNING".equals(status.get("state").asString())) {
				return status;
			}
			Thread.sleep(50);
		}
		throw new AssertionError("L'indexation ne se termine pas");
	}

	private int count() {
		return jdbc.queryForObject("select count(*) from media_items", Integer.class);
	}

	// --- Idempotence ----------------------------------------------------------------------

	@Test
	void indexesVideosAndIgnoresOtherFiles() throws Exception {
		video("a.mp4", "1");
		video("films/2020/big_buck_bunny.mkv", "22");
		video("films/clip.webm", "333");
		video("notes.txt", "pas une video");
		video("films/.hidden.mp4", "x");

		JsonNode status = scan();

		assertThat(status.get("state").asString()).isEqualTo("COMPLETED");
		assertThat(status.get("scanned").asInt()).isEqualTo(3);
		assertThat(status.get("added").asInt()).isEqualTo(3);
		assertThat(status.get("errors").asInt()).isZero();
		assertThat(count()).isEqualTo(3);
		assertThat(jdbc.queryForObject("select title from media_metadata m join media_items i on i.id = m.media_id where relative_path = 'films/2020/big_buck_bunny.mkv'", String.class))
				.isEqualTo("big buck bunny");
	}

	@Test
	void scanningTwiceCreatesNoDuplicate() throws Exception {
		video("a.mp4", "1");
		video("sub/b.mp4", "22");

		scan();
		JsonNode second = scan();

		assertThat(count()).isEqualTo(2);
		assertThat(second.get("scanned").asInt()).isEqualTo(2);
		assertThat(second.get("added").asInt()).isZero();
		assertThat(second.get("updated").asInt()).isZero();
		assertThat(jdbc.queryForObject("select count(*) from media_metadata", Integer.class)).isEqualTo(2);
	}

	@Test
	void aModifiedFileIsUpdatedNotDuplicated() throws Exception {
		Path file = video("a.mp4", "1");
		scan();
		String before = jdbc.queryForObject("select fingerprint from media_items", String.class);

		Files.writeString(file, "contenu plus long");
		Files.setLastModifiedTime(file, FileTime.from(Instant.now().plusSeconds(60)));
		JsonNode second = scan();

		assertThat(count()).isEqualTo(1);
		assertThat(second.get("updated").asInt()).isEqualTo(1);
		assertThat(jdbc.queryForObject("select fingerprint from media_items", String.class)).isNotEqualTo(before);
		assertThat(jdbc.queryForObject("select size_bytes from media_items", Long.class)).isEqualTo(17L);
	}

	@Test
	void anEditedTitleSurvivesAReindexation() throws Exception {
		video("a.mp4", "1");
		scan();
		jdbc.update("update media_metadata set title = 'Titre corrigé', edited = true");

		scan();

		assertThat(jdbc.queryForObject("select title from media_metadata", String.class)).isEqualTo("Titre corrigé");
	}

	// --- Fichiers disparus et retirés ------------------------------------------------------

	@Test
	void aMissingFileBecomesUnavailableThenAvailableAgain() throws Exception {
		Path file = video("a.mp4", "1");
		video("b.mp4", "2");
		scan();

		Files.delete(file);
		JsonNode afterDelete = scan();
		assertThat(afterDelete.get("markedUnavailable").asInt()).isEqualTo(1);
		assertThat(jdbc.queryForObject("select availability from media_items where relative_path = 'a.mp4'", String.class)).isEqualTo("UNAVAILABLE");
		assertThat(count()).isEqualTo(2);

		video("a.mp4", "1");
		scan();
		assertThat(jdbc.queryForObject("select availability from media_items where relative_path = 'a.mp4'", String.class)).isEqualTo("AVAILABLE");
		assertThat(count()).isEqualTo(2);
	}

	@Test
	void aFileWhoseProcessingFailedIsNotDeclaredUnavailable() throws Exception {
		video("a.mp4", "1");
		video("b.mp4", "2");
		scan();

		// Le scan n'a « vu » aucun des deux, mais a.mp4 est présent et a seulement échoué.
		int marked = writer.markMissing(rootId, java.util.Set.of(), java.util.Set.of("a.mp4"));

		assertThat(marked).isEqualTo(1);
		assertThat(jdbc.queryForObject("select availability from media_items where relative_path = 'a.mp4'", String.class)).isEqualTo("AVAILABLE");
		assertThat(jdbc.queryForObject("select availability from media_items where relative_path = 'b.mp4'", String.class)).isEqualTo("UNAVAILABLE");
	}

	@Test
	void anEntryRemovedByTheAdministratorIsNeverIndexedAgain() throws Exception {
		video("a.mp4", "1");
		scan();
		jdbc.update("update media_items set deleted = true");

		JsonNode second = scan();

		assertThat(count()).isEqualTo(1);
		assertThat(second.get("added").asInt()).isZero();
		assertThat(jdbc.queryForObject("select deleted from media_items", Boolean.class)).isTrue();
	}

	@Test
	void aMissingRootMarksItsMediaUnavailableAndReportsAnError() throws Exception {
		video("a.mp4", "1");
		scan();
		Files.delete(root.resolve("a.mp4"));
		Files.delete(root);

		JsonNode second = scan();

		assertThat(second.get("state").asString()).isEqualTo("COMPLETED");
		assertThat(second.get("errors").asInt()).isEqualTo(1);
		assertThat(second.get("markedUnavailable").asInt()).isEqualTo(1);
	}

	@Test
	void disabledAndRemovedRootsAreNotScanned() throws Exception {
		video("a.mp4", "1");
		jdbc.update("update media_roots set enabled = false");
		scan();
		assertThat(count()).isZero();

		jdbc.update("update media_roots set enabled = true, removed = true");
		scan();
		assertThat(count()).isZero();
	}

	// --- Erreurs ---------------------------------------------------------------------------

	@Test
	void aSymlinkLeavingTheRootIsAnErrorAndDoesNotStopTheScan() throws Exception {
		Path outside = Files.createTempFile("homeflix-outside-", ".mp4");
		video("a.mp4", "1");
		Files.createSymbolicLink(root.resolve("escape.mp4"), outside);
		video("z.mp4", "3");

		JsonNode status = scan();

		assertThat(status.get("state").asString()).isEqualTo("COMPLETED");
		assertThat(status.get("errors").asInt()).isEqualTo(1);
		assertThat(status.get("added").asInt()).isEqualTo(2);
		List<Map<String, Object>> rows = jdbc.queryForList("select relative_path from media_items order by relative_path");
		assertThat(rows).extracting(r -> r.get("relative_path")).containsExactly("a.mp4", "z.mp4");
	}

	@Test
	void aSymlinkInsideTheRootToAnAlreadySeenFileCountsAsDuplicate() throws Exception {
		Path target = video("a.mp4", "1");
		Files.createSymbolicLink(root.resolve("b.mp4"), target);

		JsonNode status = scan();

		assertThat(status.get("duplicates").asInt()).isEqualTo(1);
		assertThat(count()).isEqualTo(1);
	}

	// --- Droits ----------------------------------------------------------------------------

	@Test
	void indexationRequiresTheAdminRole() throws Exception {
		mvc.perform(post(INDEX)).andExpect(status().isUnauthorized());
		mvc.perform(post(INDEX).with(user("bob").roles("USER"))).andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
		mvc.perform(get(INDEX + "/status").with(user("bob").roles("USER"))).andExpect(status().isForbidden());
	}
}
