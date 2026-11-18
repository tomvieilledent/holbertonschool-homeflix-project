package com.homeflix.acquisition.catalogue;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
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
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * GET /api/v1/catalogue de bout en bout : HTTP, sécurité, pagination, PostgreSQL réel (Testcontainers). Les
 * assertions suivent le contrat `docs/api/acquisition.openapi.yaml` (schémas CatalogueEntry et CataloguePage).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class CatalogueApiIntegrationTests {

	private static final String URL = "/api/v1/catalogue";
	private static final UUID SINTEL_ID = UUID.fromString("7d1c0a52-3f6e-4b8a-9c21-0f4a6e2b1d11");

	@Container
	static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

	@DynamicPropertySource
	static void properties(DynamicPropertyRegistry registry) {
		registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
		registry.add("spring.datasource.username", POSTGRES::getUsername);
		registry.add("spring.datasource.password", POSTGRES::getPassword);
	}

	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;

	@AfterEach
	void clean() {
		jdbc.update("delete from downloads");
		jdbc.update("delete from catalogue_entries where id <> ?", SINTEL_ID);
	}

	private void insertEntry(String title) {
		jdbc.update("""
				insert into catalogue_entries (id, title, source, license, license_proof_url, magnet_uri, infohash, size_bytes)
				values (?, ?, 'Source de test', 'CC BY 3.0', 'https://example.org/licence', 'magnet:?xt=urn:btih:abc', ?, 1000)""",
				UUID.randomUUID(), title, UUID.randomUUID().toString().replace("-", "") + "00000000");
	}

	// --- Le catalogue renvoie l'entrée de démonstration avec sa licence et sa source ------------------

	@Test
	@WithMockUser(roles = "ADMIN")
	void theCatalogueReturnsTheDemoEntryWithItsLicenceAndSource() throws Exception {
		mvc.perform(get(URL))
				.andExpect(status().isOk())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
				.andExpect(jsonPath("$.page").value(0))
				.andExpect(jsonPath("$.size").value(20))
				.andExpect(jsonPath("$.total").value(1))
				.andExpect(jsonPath("$.totalPages").value(1))
				.andExpect(jsonPath("$.items", hasSize(1)))
				.andExpect(jsonPath("$.items[0].id").value(SINTEL_ID.toString()))
				.andExpect(jsonPath("$.items[0].title").value("Sintel"))
				.andExpect(jsonPath("$.items[0].source").value(org.hamcrest.Matchers.containsString("Blender Foundation")))
				.andExpect(jsonPath("$.items[0].license").value(org.hamcrest.Matchers.containsString("CC BY 3.0")))
				.andExpect(jsonPath("$.items[0].licenseProofUrl").value("https://durian.blender.org/sharing/"))
				.andExpect(jsonPath("$.items[0].sizeBytes").value(129302391))
				.andExpect(jsonPath("$.items[0].inLibrary").value(false))
				.andExpect(jsonPath("$.items[0].libraryMediaId").value(org.hamcrest.Matchers.nullValue()))
				.andExpect(jsonPath("$.items[0].activeDownloadId").value(org.hamcrest.Matchers.nullValue()));
	}

	@Test
	@WithMockUser(roles = "ADMIN")
	void theResponseNeverContainsTheMagnetLinkTheInfohashOrAClientIdentifier() throws Exception {
		String body = mvc.perform(get(URL)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

		// Le mot « torrent » peut apparaître dans le texte de la source ; on cherche les champs et valeurs sensibles.
		org.assertj.core.api.Assertions.assertThat(body)
				.doesNotContain("magnet:")
				.doesNotContain("magnetUri")
				.doesNotContain("btih")
				.doesNotContain("08ada5a7a6183aae1e09d831df6748d566095a10")
				.doesNotContainIgnoringCase("infohash")
				.doesNotContain("torrentId")
				.doesNotContain("opentrackr")
				.doesNotContain("fileRelativePath");
	}

	@Test
	@WithMockUser(roles = "ADMIN")
	void anActiveDownloadIsReportedOnItsEntry() throws Exception {
		UUID downloadId = UUID.randomUUID();
		jdbc.update("insert into downloads (id, entry_id, requested_by, state) values (?, ?, ?, 'DOWNLOADING')",
				downloadId, SINTEL_ID, UUID.randomUUID());

		mvc.perform(get(URL))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[0].activeDownloadId").value(downloadId.toString()));
	}

	@Test
	@WithMockUser(roles = "ADMIN")
	void aFinishedDownloadIsNotReportedAsActive() throws Exception {
		jdbc.update("insert into downloads (id, entry_id, requested_by, state) values (?, ?, ?, 'COMPLETED')",
				UUID.randomUUID(), SINTEL_ID, UUID.randomUUID());

		mvc.perform(get(URL))
				.andExpect(jsonPath("$.items[0].activeDownloadId").value(org.hamcrest.Matchers.nullValue()));
	}

	// --- Pagination -------------------------------------------------------------------------------

	@Test
	@WithMockUser(roles = "ADMIN")
	void entriesArePagedAndSortedByTitle() throws Exception {
		insertEntry("Alpha");
		insertEntry("Zorro");

		mvc.perform(get(URL).param("size", "2"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.total").value(3))
				.andExpect(jsonPath("$.totalPages").value(2))
				.andExpect(jsonPath("$.items", hasSize(2)))
				.andExpect(jsonPath("$.items[0].title").value("Alpha"))
				.andExpect(jsonPath("$.items[1].title").value("Sintel"));

		mvc.perform(get(URL).param("size", "2").param("page", "1"))
				.andExpect(jsonPath("$.items", hasSize(1)))
				.andExpect(jsonPath("$.items[0].title").value("Zorro"));
	}

	@Test
	@WithMockUser(roles = "ADMIN")
	void aPageBeyondTheEndIsEmptyNotAnError() throws Exception {
		mvc.perform(get(URL).param("page", "5"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items", hasSize(0)))
				.andExpect(jsonPath("$.total").value(1));
	}

	@Test
	@WithMockUser(roles = "ADMIN")
	void invalidPaginationParametersGet400WithTheFieldInProblemJson() throws Exception {
		mvc.perform(get(URL).param("size", "51"))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
				.andExpect(jsonPath("$.errors[0].field").value("size"));
		mvc.perform(get(URL).param("size", "0")).andExpect(status().isBadRequest());
		mvc.perform(get(URL).param("page", "-1"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors[0].field").value("page"));
		mvc.perform(get(URL).param("page", "abc"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
	}

	// --- Droits -----------------------------------------------------------------------------------

	@Test
	void anonymousGets401() throws Exception {
		mvc.perform(get(URL)).andExpect(status().isUnauthorized());
	}

	@Test
	@WithMockUser(roles = "USER")
	void anOrdinaryUserGets403() throws Exception {
		mvc.perform(get(URL)).andExpect(status().isForbidden());
	}
}
