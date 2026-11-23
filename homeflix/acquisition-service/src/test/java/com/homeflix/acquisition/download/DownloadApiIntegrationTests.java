package com.homeflix.acquisition.download;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.homeflix.acquisition.torrent.TorrentClient;
import com.homeflix.acquisition.torrent.TorrentClientUnavailableException;

/**
 * Rappel des droits et téléchargements de bout en bout (HTTP, sécurité, PostgreSQL réel) avec un faux client
 * BitTorrent. Le compte vient du jeton (`sub`), jamais du corps.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class DownloadApiIntegrationTests {

	private static final UUID SINTEL_ID = UUID.fromString("7d1c0a52-3f6e-4b8a-9c21-0f4a6e2b1d11");
	private static final String VERSION = "2026-11";
	private static final String SINTEL_HASH = "08ada5a7a6183aae1e09d831df6748d566095a10";

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
	@MockitoBean TorrentClient torrent;

	private final UUID admin = UUID.randomUUID();

	private RequestPostProcessor asAdmin() {
		return jwt().jwt(j -> j.subject(admin.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"));
	}

	private RequestPostProcessor asUser() {
		return jwt().jwt(j -> j.subject(UUID.randomUUID().toString())).authorities(new SimpleGrantedAuthority("ROLE_USER"));
	}

	@BeforeEach
	void setUp() {
		reset(torrent);
		when(torrent.add(anyString())).thenReturn(SINTEL_HASH);
	}

	@AfterEach
	void clean() {
		jdbc.update("delete from downloads");
		jdbc.update("delete from rights_acknowledgements");
	}

	private static final String SINTEL_BODY = "{\"catalogueEntryId\":\"" + SINTEL_ID + "\"}";

	private void acknowledge() throws Exception {
		mvc.perform(post("/api/v1/rights-notice/ack").with(asAdmin()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"noticeVersion\":\"" + VERSION + "\"}")).andExpect(status().isOk());
	}

	private String startSintel() throws Exception {
		return mvc.perform(post("/api/v1/downloads").with(asAdmin()).contentType(MediaType.APPLICATION_JSON)
				.content(SINTEL_BODY)).andReturn().getResponse().getContentAsString();
	}

	private String startedId() throws Exception {
		acknowledge();
		return com.jayway.jsonpath.JsonPath.read(startSintel(), "$.id");
	}

	// --- Rappel des droits ---------------------------------------------------------------------------

	@Test
	void theNoticeIsNotAcknowledgedUntilTheAccountAcknowledgesIt() throws Exception {
		mvc.perform(get("/api/v1/rights-notice").with(asAdmin()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.version").value(VERSION))
				.andExpect(jsonPath("$.text").isNotEmpty())
				.andExpect(jsonPath("$.acknowledged").value(false));
		acknowledge();
		mvc.perform(get("/api/v1/rights-notice").with(asAdmin()))
				.andExpect(jsonPath("$.acknowledged").value(true))
				.andExpect(jsonPath("$.acknowledgedAt").isNotEmpty());
	}

	@Test
	void acknowledgingTwiceIsIdempotent() throws Exception {
		acknowledge();
		acknowledge();
		assertThat(jdbc.queryForObject("select count(*) from rights_acknowledgements", Integer.class)).isEqualTo(1);
	}

	@Test
	void acknowledgingAnOutdatedVersionIsRefused() throws Exception {
		mvc.perform(post("/api/v1/rights-notice/ack").with(asAdmin()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"noticeVersion\":\"2000-01\"}"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("CONFLICT"));
	}

	@Test
	void anotherAccountHasNotAcknowledged() throws Exception {
		acknowledge();
		mvc.perform(get("/api/v1/rights-notice").with(jwt().jwt(j -> j.subject(UUID.randomUUID().toString()))
				.authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
				.andExpect(jsonPath("$.acknowledged").value(false));
	}

	// --- Démarrage ---------------------------------------------------------------------------------------

	@Test
	void startingWithoutAcknowledgingTheNoticeGets412AndNeverCallsTheClient() throws Exception {
		mvc.perform(post("/api/v1/downloads").with(asAdmin()).contentType(MediaType.APPLICATION_JSON).content(SINTEL_BODY))
				.andExpect(status().isPreconditionFailed())
				.andExpect(jsonPath("$.code").value("RIGHTS_NOT_ACKNOWLEDGED"));
		verify(torrent, never()).add(anyString());
		assertThat(jdbc.queryForObject("select count(*) from downloads", Integer.class)).isZero();
	}

	@Test
	void anAdminStartsADownloadAndItIsObservable() throws Exception {
		acknowledge();
		mvc.perform(post("/api/v1/downloads").with(asAdmin()).contentType(MediaType.APPLICATION_JSON).content(SINTEL_BODY))
				.andExpect(status().isAccepted())
				.andExpect(header().string("Location", org.hamcrest.Matchers.startsWith("/api/v1/downloads/")))
				.andExpect(jsonPath("$.state").value("DOWNLOADING"))
				.andExpect(jsonPath("$.title").value("Sintel"))
				.andExpect(jsonPath("$.progressPercent").value(0))
				.andExpect(jsonPath("$.catalogueEntryId").value(SINTEL_ID.toString()));
		verify(torrent).add(org.mockito.ArgumentMatchers.contains(SINTEL_HASH));
		assertThat(jdbc.queryForObject("select requested_by from downloads", UUID.class)).isEqualTo(admin);
	}

	@Test
	void theResponseNeverContainsTheMagnetTheInfohashOrTheClientIdentifier() throws Exception {
		acknowledge();
		String body = startSintel();
		assertThat(body).doesNotContain("magnet:").doesNotContain("btih").doesNotContain(SINTEL_HASH)
				.doesNotContainIgnoringCase("infohash").doesNotContain("torrentId").doesNotContain("fileRelativePath");
	}

	@Test
	void aSecondActiveDownloadOfTheSameEntryGets409() throws Exception {
		acknowledge();
		startSintel();
		mvc.perform(post("/api/v1/downloads").with(asAdmin()).contentType(MediaType.APPLICATION_JSON).content(SINTEL_BODY))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("DOWNLOAD_ALREADY_ACTIVE"));
		assertThat(jdbc.queryForObject("select count(*) from downloads", Integer.class)).isEqualTo(1);
	}

	@Test
	void aNewDownloadIsPossibleOnceThePreviousOneIsCancelled() throws Exception {
		String id = startedId();
		mvc.perform(post("/api/v1/downloads/" + id + "/cancel").with(asAdmin())).andExpect(status().isOk());
		mvc.perform(post("/api/v1/downloads").with(asAdmin()).contentType(MediaType.APPLICATION_JSON).content(SINTEL_BODY))
				.andExpect(status().isAccepted());
	}

	@Test
	void anUnknownEntryGets404() throws Exception {
		acknowledge();
		mvc.perform(post("/api/v1/downloads").with(asAdmin()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"catalogueEntryId\":\"" + UUID.randomUUID() + "\"}"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NOT_FOUND"));
	}

	@Test
	void theBodyAcceptsNothingButACatalogueEntryId() throws Exception {
		acknowledge();
		for (String body : new String[] {
				"{\"catalogueEntryId\":\"" + SINTEL_ID + "\",\"url\":\"http://169.254.169.254/\"}",
				"{\"catalogueEntryId\":\"" + SINTEL_ID + "\",\"magnetUri\":\"magnet:?xt=urn:btih:abc\"}",
				"{\"magnetUri\":\"magnet:?xt=urn:btih:abc\"}",
				"{\"catalogueEntryId\":\"pas-un-uuid\"}", "{}" }) {
			mvc.perform(post("/api/v1/downloads").with(asAdmin()).contentType(MediaType.APPLICATION_JSON).content(body))
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
		}
		verify(torrent, never()).add(anyString());
	}

	@Test
	void anUnavailableClientGets503AndTheDownloadIsMarkedFailed() throws Exception {
		acknowledge();
		when(torrent.add(anyString())).thenThrow(new TorrentClientUnavailableException());
		mvc.perform(post("/api/v1/downloads").with(asAdmin()).contentType(MediaType.APPLICATION_JSON).content(SINTEL_BODY))
				.andExpect(status().isServiceUnavailable())
				.andExpect(jsonPath("$.code").value("TORRENT_CLIENT_UNAVAILABLE"));
		assertThat(jdbc.queryForObject("select state from downloads", String.class)).isEqualTo("FAILED");
		assertThat(jdbc.queryForObject("select error_code from downloads", String.class)).isEqualTo("TORRENT_CLIENT_UNAVAILABLE");
		// L'entrée n'est plus bloquée : un nouvel essai est possible.
		org.mockito.Mockito.doReturn(SINTEL_HASH).when(torrent).add(anyString());
		mvc.perform(post("/api/v1/downloads").with(asAdmin()).contentType(MediaType.APPLICATION_JSON).content(SINTEL_BODY))
				.andExpect(status().isAccepted());
	}

	@Test
	void anyOtherClientErrorMarksTheDownloadFailedAndDoesNotBlockTheEntry() throws Exception {
		acknowledge();
		when(torrent.add(anyString())).thenThrow(new IllegalArgumentException("pas un lien magnet"));
		mvc.perform(post("/api/v1/downloads").with(asAdmin()).contentType(MediaType.APPLICATION_JSON).content(SINTEL_BODY))
				.andExpect(status().isInternalServerError())
				.andExpect(jsonPath("$.code").value("INTERNAL_ERROR"));
		assertThat(jdbc.queryForObject("select state from downloads", String.class)).isEqualTo("FAILED");
		assertThat(jdbc.queryForObject("select error_code from downloads", String.class)).isEqualTo("DOWNLOAD_FAILED");
		org.mockito.Mockito.doReturn(SINTEL_HASH).when(torrent).add(anyString());
		mvc.perform(post("/api/v1/downloads").with(asAdmin()).contentType(MediaType.APPLICATION_JSON).content(SINTEL_BODY))
				.andExpect(status().isAccepted());
	}

	// --- Suivi -------------------------------------------------------------------------------------------

	@Test
	void aDownloadIsReadAndListed() throws Exception {
		String id = startedId();
		mvc.perform(get("/api/v1/downloads/" + id).with(asAdmin()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(id))
				.andExpect(jsonPath("$.state").value("DOWNLOADING"));
		mvc.perform(get("/api/v1/downloads").with(asAdmin()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.total").value(1))
				.andExpect(jsonPath("$.items[0].id").value(id))
				.andExpect(jsonPath("$.items[0].title").value("Sintel"));
		mvc.perform(get("/api/v1/downloads?state=CANCELLED").with(asAdmin()))
				.andExpect(jsonPath("$.total").value(0));
		mvc.perform(get("/api/v1/downloads?state=INCONNU").with(asAdmin())).andExpect(status().isBadRequest());
		mvc.perform(get("/api/v1/downloads?size=0").with(asAdmin())).andExpect(status().isBadRequest());
		mvc.perform(get("/api/v1/downloads/" + UUID.randomUUID()).with(asAdmin())).andExpect(status().isNotFound());
	}

	@Test
	void everyStateIsObservableThroughTheApi() throws Exception {
		for (String state : new String[] { "QUEUED", "DOWNLOADING", "COMPLETED", "FAILED", "CANCELLED" }) {
			UUID id = UUID.randomUUID();
			jdbc.update("insert into downloads (id, entry_id, requested_by, state) values (?, ?, ?, ?)", id, SINTEL_ID, admin, state);
			mvc.perform(get("/api/v1/downloads/" + id).with(asAdmin()))
					.andExpect(jsonPath("$.state").value(state));
			jdbc.update("delete from downloads where id = ?", id);
		}
	}

	@Test
	void aFailedDownloadShowsAReadableMessageWithoutTechnicalDetail() throws Exception {
		jdbc.update("insert into downloads (id, entry_id, requested_by, state, error_code) values (?, ?, ?, 'FAILED', 'DISK_FULL')",
				UUID.randomUUID(), SINTEL_ID, admin);
		mvc.perform(get("/api/v1/downloads").with(asAdmin()))
				.andExpect(jsonPath("$.items[0].errorCode").value("DISK_FULL"))
				.andExpect(jsonPath("$.items[0].errorMessage").value("Il n'y a plus assez de place sur le disque."));
	}

	// --- Annulation --------------------------------------------------------------------------------------

	@Test
	void cancellingCallsTheClientAndFreesTheEntry() throws Exception {
		String id = startedId();
		mvc.perform(post("/api/v1/downloads/" + id + "/cancel").with(asAdmin()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.state").value("CANCELLED"))
				.andExpect(jsonPath("$.finishedAt").isNotEmpty());
		verify(torrent).cancel(SINTEL_HASH);
	}

	@Test
	void cancellingTwiceIsIdempotent() throws Exception {
		String id = startedId();
		mvc.perform(post("/api/v1/downloads/" + id + "/cancel").with(asAdmin())).andExpect(status().isOk());
		mvc.perform(post("/api/v1/downloads/" + id + "/cancel").with(asAdmin()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.state").value("CANCELLED"));
		verify(torrent, org.mockito.Mockito.times(1)).cancel(anyString());
	}

	@Test
	void aTerminalDownloadCannotBeCancelled() throws Exception {
		for (String state : new String[] { "COMPLETED", "FAILED" }) {
			UUID id = UUID.randomUUID();
			jdbc.update("insert into downloads (id, entry_id, requested_by, state) values (?, ?, ?, ?)", id, SINTEL_ID, admin, state);
			mvc.perform(post("/api/v1/downloads/" + id + "/cancel").with(asAdmin()))
					.andExpect(status().isConflict())
					.andExpect(jsonPath("$.code").value("CONFLICT"));
			jdbc.update("delete from downloads where id = ?", id);
		}
	}

	@Test
	void cancellingWhileTheClientIsDownKeepsTheDownloadActive() throws Exception {
		String id = startedId();
		doThrow(new TorrentClientUnavailableException()).when(torrent).cancel(anyString());
		mvc.perform(post("/api/v1/downloads/" + id + "/cancel").with(asAdmin()))
				.andExpect(status().isServiceUnavailable())
				.andExpect(jsonPath("$.code").value("TORRENT_CLIENT_UNAVAILABLE"));
		assertThat(jdbc.queryForObject("select state from downloads", String.class)).isEqualTo("DOWNLOADING");
	}

	@Test
	void cancellingAnUnknownDownloadGets404() throws Exception {
		mvc.perform(post("/api/v1/downloads/" + UUID.randomUUID() + "/cancel").with(asAdmin()))
				.andExpect(status().isNotFound());
	}

	// --- Rôles ---------------------------------------------------------------------------------------------

	@Test
	void aUserGets403OnEveryRoute() throws Exception {
		mvc.perform(post("/api/v1/downloads").with(asUser()).contentType(MediaType.APPLICATION_JSON).content(SINTEL_BODY))
				.andExpect(status().isForbidden());
		mvc.perform(get("/api/v1/downloads").with(asUser())).andExpect(status().isForbidden());
		mvc.perform(get("/api/v1/downloads/" + UUID.randomUUID()).with(asUser())).andExpect(status().isForbidden());
		mvc.perform(post("/api/v1/downloads/" + UUID.randomUUID() + "/cancel").with(asUser())).andExpect(status().isForbidden());
		mvc.perform(get("/api/v1/rights-notice").with(asUser())).andExpect(status().isForbidden());
		mvc.perform(post("/api/v1/rights-notice/ack").with(asUser()).contentType(MediaType.APPLICATION_JSON)
				.content("{\"noticeVersion\":\"" + VERSION + "\"}")).andExpect(status().isForbidden());
		verify(torrent, never()).add(anyString());
	}

	@Test
	void anonymousGets401() throws Exception {
		mvc.perform(get("/api/v1/downloads")).andExpect(status().isUnauthorized());
		mvc.perform(post("/api/v1/downloads").contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void twoSimultaneousStartsYieldOneDownload() throws Exception {
		acknowledge();
		var pool = Executors.newFixedThreadPool(2);
		try {
			Callable<Integer> call = () -> mvc.perform(post("/api/v1/downloads").with(asAdmin())
					.contentType(MediaType.APPLICATION_JSON).content(SINTEL_BODY)).andReturn().getResponse().getStatus();
			var results = pool.invokeAll(List.of(call, call));
			assertThat(List.of(results.get(0).get(), results.get(1).get())).containsExactlyInAnyOrder(202, 409);
		} finally {
			pool.shutdownNow();
		}
		assertThat(jdbc.queryForObject("select count(*) from downloads", Integer.class)).isEqualTo(1);
	}
}
