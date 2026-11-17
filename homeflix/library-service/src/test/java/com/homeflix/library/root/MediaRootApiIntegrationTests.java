package com.homeflix.library.root;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Dossiers autorisés de bout en bout : HTTP, règles de validation, PostgreSQL réel (Testcontainers)
 * et vrai système de fichiers temporaire. Chaque refus doit être clair pour l'administrateur.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class MediaRootApiIntegrationTests {

	private static final String URL = "/api/v1/admin/media-roots";

	@Container
	static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

	/** Emplacement autorisé pour les tests (équivalent de /media dans le conteneur). */
	static final Path BASE = createTempDir("homeflix-base-");

	@DynamicPropertySource
	static void properties(DynamicPropertyRegistry registry) {
		registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
		registry.add("spring.datasource.username", POSTGRES::getUsername);
		registry.add("spring.datasource.password", POSTGRES::getPassword);
		registry.add("identity.jwks-uri", () -> "http://identity-service:8081/.well-known/jwks.json");
		registry.add("library.allowed-bases", () -> BASE.toString());
	}

	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;

	Path films;

	@BeforeEach
	void setUp() throws IOException {
		films = Files.createDirectories(BASE.resolve("films"));
		Files.createDirectories(BASE.resolve("films/2020"));
		Files.createDirectories(BASE.resolve("series"));
		Files.writeString(BASE.resolve("lisez-moi.txt"), "pas un dossier");
	}

	@AfterEach
	void clean() {
		jdbc.update("delete from media_items");
		jdbc.update("delete from media_roots");
	}

	private static Path createTempDir(String prefix) {
		try {
			return Files.createTempDirectory(prefix).toRealPath();
		} catch (IOException e) {
			throw new IllegalStateException(e);
		}
	}

	private static String body(String path) {
		return "{\"path\":\"" + path.replace("\\", "\\\\") + "\"}";
	}

	private ResultActions create(String path) throws Exception {
		return mvc.perform(post(URL).with(user("admin").roles("ADMIN")).contentType(MediaType.APPLICATION_JSON).content(body(path)));
	}

	private UUID createRoot(Path path) throws Exception {
		create(path.toString()).andExpect(status().isCreated());
		return jdbc.queryForObject("select id from media_roots where path = ? and not removed", UUID.class, path.toRealPath().toString());
	}

	// --- Création -------------------------------------------------------------------------

	@Test
	@WithMockUser(roles = "ADMIN")
	void createsARootWithItsCanonicalPathAndADefaultLabel() throws Exception {
		create(films.toString())
				.andExpect(status().isCreated())
				.andExpect(header().string("Location", containsString(URL + "/")))
				.andExpect(jsonPath("$.path").value(films.toRealPath().toString()))
				.andExpect(jsonPath("$.label").value("films"))
				.andExpect(jsonPath("$.enabled").value(true));

		mvc.perform(get(URL)).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
	}

	@Test
	@WithMockUser(roles = "ADMIN")
	void usesTheLabelProvidedByTheAdministrator() throws Exception {
		mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON)
						.content("{\"path\":\"" + films + "\",\"label\":\"  Mes films  \"}"))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.label").value("Mes films"));
	}

	@Test
	@WithMockUser(roles = "ADMIN")
	void rejectsAMissingPathWithAProblemDetailListingTheField() throws Exception {
		mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.errors[0].field").value("path"));
	}

	@Test
	@WithMockUser(roles = "ADMIN")
	void rejectsAMalformedBodyWithoutLeakingDetails() throws Exception {
		mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content("{pas du json"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
				.andExpect(content().string(org.hamcrest.Matchers.not(containsString("Exception"))));
	}

	@Test
	@WithMockUser(roles = "ADMIN")
	void explainsAFolderThatDoesNotExist() throws Exception {
		create(BASE.resolve("inconnu").toString())
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("ROOT_NOT_FOUND"))
				.andExpect(jsonPath("$.detail").value(containsString("introuvable")));
	}

	@Test
	@WithMockUser(roles = "ADMIN")
	void explainsThatAFileIsNotAFolder() throws Exception {
		create(BASE.resolve("lisez-moi.txt").toString())
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("ROOT_NOT_A_DIRECTORY"))
				.andExpect(jsonPath("$.detail").value(containsString("pas un dossier")));
	}

	@Test
	@WithMockUser(roles = "ADMIN")
	void explainsAFolderThatCannotBeRead() throws Exception {
		Path locked = Files.createDirectories(BASE.resolve("prive"));
		Files.setPosixFilePermissions(locked, PosixFilePermissions.fromString("---------"));
		try {
			// Le propriétaire « root » (certains environnements de CI) lit tout : le cas n'est alors pas testable.
			Assumptions.assumeFalse(Files.isReadable(locked), "l'utilisateur courant peut lire un dossier sans droits");
			create(locked.toString())
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.code").value("ROOT_NOT_READABLE"))
					.andExpect(jsonPath("$.detail").value(containsString("droit de lire")));
		} finally {
			Files.setPosixFilePermissions(locked, PosixFilePermissions.fromString("rwxr-xr-x"));
		}
	}

	// --- Emplacements autorisés et chemins dangereux --------------------------------------

	@Test
	@WithMockUser(roles = "ADMIN")
	void refusesFoldersOutsideTheAllowedBaseWithoutProbingTheDisk() throws Exception {
		for (String path : new String[] { "/", "/etc", "/proc/self", "/root", "/tmp" }) {
			create(path).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("ROOT_NOT_ALLOWED"));
		}
	}

	@Test
	@WithMockUser(roles = "ADMIN")
	void refusesRelativePathsAndDotDotSegments() throws Exception {
		create("films").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("ROOT_NOT_ALLOWED"));
		create(BASE + "/films/../../etc").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("ROOT_NOT_ALLOWED"));
		create(BASE + "/films/..").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("ROOT_NOT_ALLOWED"));
	}

	@Test
	@WithMockUser(roles = "ADMIN")
	void refusesASymlinkThatLeadsOutsideTheAllowedBase() throws Exception {
		Path outside = createTempDir("homeflix-outside-");
		Files.createSymbolicLink(BASE.resolve("evasion"), outside);
		create(BASE.resolve("evasion").toString())
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("ROOT_NOT_ALLOWED"));
	}

	// --- Chevauchement -----------------------------------------------------------------------

	@Test
	@WithMockUser(roles = "ADMIN")
	void refusesFoldersThatOverlapAnExistingRoot() throws Exception {
		createRoot(films);

		create(films.toString()).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ROOT_OVERLAP"));
		create(BASE.resolve("films/2020").toString()).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ROOT_OVERLAP"));
		create(BASE.toString()).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ROOT_OVERLAP"));
		create(BASE.resolve("series").toString()).andExpect(status().isCreated());
	}

	// --- Vérification sans enregistrement ------------------------------------------------------

	@Test
	@WithMockUser(roles = "ADMIN")
	void validateAlwaysAnswers200AndExplainsTheProblem() throws Exception {
		mvc.perform(post(URL + "/validate").contentType(MediaType.APPLICATION_JSON).content(body(films.toString())))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.valid").value(true))
				.andExpect(jsonPath("$.code").doesNotExist());

		mvc.perform(post(URL + "/validate").contentType(MediaType.APPLICATION_JSON).content(body(BASE.resolve("inconnu").toString())))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.valid").value(false))
				.andExpect(jsonPath("$.code").value("ROOT_NOT_FOUND"))
				.andExpect(jsonPath("$.message").value(containsString("introuvable")));

		mvc.perform(post(URL + "/validate").contentType(MediaType.APPLICATION_JSON).content(body("/etc")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.code").value("ROOT_NOT_ALLOWED"));

		mvc.perform(get(URL)).andExpect(jsonPath("$.length()").value(0));   // rien n'a été enregistré
	}

	@Test
	@WithMockUser(roles = "ADMIN")
	void validateRejectsABlankPath() throws Exception {
		mvc.perform(post(URL + "/validate").contentType(MediaType.APPLICATION_JSON).content("{\"path\":\"   \"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
	}

	// --- Modification -------------------------------------------------------------------------

	@Test
	@WithMockUser(roles = "ADMIN")
	void updatesTheLabelAndTheActivation() throws Exception {
		UUID id = createRoot(films);

		mvc.perform(patch(URL + "/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"label\":\"Cinéma\",\"enabled\":false}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.label").value("Cinéma"))
				.andExpect(jsonPath("$.enabled").value(false))
				.andExpect(jsonPath("$.path").value(films.toRealPath().toString()));
	}

	@Test
	@WithMockUser(roles = "ADMIN")
	void thePathCannotBeChangedAndAnEmptyPatchIsRefused() throws Exception {
		UUID id = createRoot(films);

		mvc.perform(patch(URL + "/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"path\":\"" + BASE.resolve("series") + "\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
		mvc.perform(patch(URL + "/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"label\":\"\"}"))
				.andExpect(status().isBadRequest());
		assertThat(jdbc.queryForObject("select path from media_roots where id = ?", String.class, id)).isEqualTo(films.toRealPath().toString());
	}

	@Test
	@WithMockUser(roles = "ADMIN")
	void updatingAnUnknownRootIsNotFound() throws Exception {
		mvc.perform(patch(URL + "/" + UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":false}"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NOT_FOUND"));
		mvc.perform(patch(URL + "/pas-un-uuid").contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":false}"))
				.andExpect(status().isBadRequest());
	}

	// --- Retrait ------------------------------------------------------------------------------

	@Test
	@WithMockUser(roles = "ADMIN")
	void removingARootKeepsItsMediaAsUnavailableAndDeletesNoFile() throws Exception {
		UUID id = createRoot(films);
		Path file = Files.writeString(films.resolve("sintel.mp4"), "video");
		UUID mediaId = UUID.randomUUID();
		jdbc.update("""
				insert into media_items (id, root_id, relative_path, size_bytes, file_mtime, fingerprint, last_seen_at)
				values (?, ?, 'sintel.mp4', 5, now(), 'fp', now())""", mediaId, id);

		mvc.perform(delete(URL + "/" + id)).andExpect(status().isNoContent());

		assertThat(jdbc.queryForObject("select availability from media_items where id = ?", String.class, mediaId)).isEqualTo("UNAVAILABLE");
		assertThat(file).exists();
		mvc.perform(get(URL)).andExpect(jsonPath("$.length()").value(0));
		mvc.perform(delete(URL + "/" + id)).andExpect(status().isNotFound());
	}

	@Test
	@WithMockUser(roles = "ADMIN")
	void aRemovedFolderCanBeAddedAgain() throws Exception {
		UUID id = createRoot(films);
		mvc.perform(delete(URL + "/" + id)).andExpect(status().isNoContent());

		create(films.toString()).andExpect(status().isCreated());
		assertThat(jdbc.queryForObject("select count(*) from media_roots where path = ?", Integer.class, films.toRealPath().toString())).isEqualTo(2);
	}

	// --- Autorisation ---------------------------------------------------------------------------

	@Test
	@WithMockUser(roles = "USER")
	void anOrdinaryUserIsForbiddenOnEveryOperation() throws Exception {
		UUID id = UUID.randomUUID();
		mvc.perform(get(URL)).andExpect(status().isForbidden())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
		mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(body(films.toString()))).andExpect(status().isForbidden());
		mvc.perform(post(URL + "/validate").contentType(MediaType.APPLICATION_JSON).content(body(films.toString()))).andExpect(status().isForbidden());
		mvc.perform(patch(URL + "/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":false}")).andExpect(status().isForbidden());
		mvc.perform(delete(URL + "/" + id)).andExpect(status().isForbidden());
		assertThat(jdbc.queryForObject("select count(*) from media_roots", Integer.class)).isZero();
	}

	@Test
	void anAnonymousCallerIsUnauthorized() throws Exception {
		mvc.perform(get(URL)).andExpect(status().isUnauthorized());
		mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(body(films.toString()))).andExpect(status().isUnauthorized());
		mvc.perform(delete(URL + "/" + UUID.randomUUID())).andExpect(status().isUnauthorized());
	}
}
