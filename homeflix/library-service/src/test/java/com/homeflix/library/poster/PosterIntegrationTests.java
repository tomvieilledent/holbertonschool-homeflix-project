package com.homeflix.library.poster;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
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

import com.homeflix.library.catalogue.MediaCatalogueRepository;
import com.homeflix.library.index.IndexJob;
import com.homeflix.library.index.IndexScanner;

/** De l'indexation à l'image servie : l'affiche voisine de la vidéo, par une adresse signée seulement. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class PosterIntegrationTests {

	@TempDir
	static Path root;

	@Container
	static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

	@DynamicPropertySource
	static void properties(DynamicPropertyRegistry registry) {
		registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
		registry.add("spring.datasource.username", POSTGRES::getUsername);
		registry.add("spring.datasource.password", POSTGRES::getPassword);
		registry.add("identity.jwks-uri", () -> "http://identity-service:8081/.well-known/jwks.json");
		registry.add("library.allowed-bases", () -> root.toString());
	}

	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;
	@Autowired IndexScanner scanner;
	@Autowired MediaCatalogueRepository catalogue;

	@AfterEach
	void clean() {
		jdbc.update("delete from media_items");
		jdbc.update("delete from media_roots");
	}

	private String indexedPosterUrl() {
		scanner.scan(new IndexJob());
		UUID id = jdbc.queryForObject("select id from media_items", UUID.class);
		return catalogue.findById(id).orElseThrow().posterUrl();
	}

	@Test
	void theImageBesideTheVideoIsServedOnlyThroughItsSignedAddress() throws Exception {
		Files.writeString(root.resolve("film.mp4"), "video");
		Files.writeString(root.resolve("film.jpg"), "image");
		jdbc.update("insert into media_roots (id, path, label) values (?, ?, 'test')", UUID.randomUUID(),
				root.toRealPath().toString());

		String url = indexedPosterUrl();
		assertThat(url).startsWith("/api/library/v1/posters/").doesNotContain("film");
		String path = url.replace("/api/library/v1", "/api/v1");

		mvc.perform(get(path)).andExpect(status().isOk()).andExpect(header().string("Content-Type", "image/jpeg"));
		mvc.perform(get(path.substring(0, path.indexOf('?')))).andExpect(status().isForbidden());
		mvc.perform(get(path + "x")).andExpect(status().isForbidden());
		mvc.perform(get(path.replaceAll("posters/[^?]+", "posters/" + UUID.randomUUID()))).andExpect(status().isForbidden());

		Path outside = Files.createTempFile("homeflix-outside-", ".jpg");
		try {
			Files.delete(root.resolve("film.jpg"));
			Files.createSymbolicLink(root.resolve("film.jpg"), outside);
			mvc.perform(get(path)).andExpect(status().isNotFound()); // lien hors de la racine : jamais servi
		} finally {
			Files.deleteIfExists(root.resolve("film.jpg"));
			Files.deleteIfExists(outside);
		}
		assertThat(indexedPosterUrl()).isNull();
	}
}
