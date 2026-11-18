package com.homeflix.acquisition.catalogue;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.homeflix.acquisition.download.Download;
import com.homeflix.acquisition.download.DownloadRepository;
import com.homeflix.acquisition.download.DownloadState;
import com.homeflix.acquisition.rights.RightsAcknowledgement;
import com.homeflix.acquisition.rights.RightsAcknowledgementRepository;

/**
 * Schéma et seed d'Acquisition sur un vrai PostgreSQL (Testcontainers). Le démarrage du contexte vérifie aussi
 * `ddl-auto=validate` : les entités correspondent aux migrations. Les règles de droits sont des contraintes de la
 * base : elles tiennent même si un autre code (ou une requête manuelle) écrit dans la table.
 */
@SpringBootTest
@Testcontainers
class CataloguePersistenceIntegrationTests {

	/** Identifiant fixe de l'entrée de démonstration (V2__seed_demo_catalogue.sql). */
	static final UUID SINTEL_ID = UUID.fromString("7d1c0a52-3f6e-4b8a-9c21-0f4a6e2b1d11");
	static final String SINTEL_INFOHASH = "08ada5a7a6183aae1e09d831df6748d566095a10";

	@Container
	static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

	@DynamicPropertySource
	static void properties(DynamicPropertyRegistry registry) {
		registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
		registry.add("spring.datasource.username", POSTGRES::getUsername);
		registry.add("spring.datasource.password", POSTGRES::getPassword);
	}

	@Autowired CatalogueEntryRepository entries;
	@Autowired DownloadRepository downloads;
	@Autowired RightsAcknowledgementRepository acknowledgements;
	@Autowired JdbcTemplate jdbc;

	@AfterEach
	void clean() {
		jdbc.update("delete from downloads");
		jdbc.update("delete from rights_acknowledgements");
		jdbc.update("delete from catalogue_entries where id <> ?", SINTEL_ID);
	}

	private int insertEntry(String id, String title, String source, String license, String proof, String magnet,
			String infohash, long size) {
		return jdbc.update("""
				insert into catalogue_entries (id, title, source, license, license_proof_url, magnet_uri, infohash, size_bytes)
				values (?::uuid, ?, ?, ?, ?, ?, ?, ?)""", id, title, source, license, proof, magnet, infohash, size);
	}

	private String freshId() {
		return UUID.randomUUID().toString();
	}

	private String freshHash() {
		return UUID.randomUUID().toString().replace("-", "") + "00000000";   // 40 caractères hexadécimaux
	}

	private static final String MAGNET = "magnet:?xt=urn:btih:abc";
	private static final String PROOF = "https://example.org/licence";

	// --- Seed --------------------------------------------------------------------------------

	@Test
	void theDemoEntryIsSeededWithItsLicenceSourceAndProof() {
		CatalogueEntry sintel = entries.findById(SINTEL_ID).orElseThrow();

		assertThat(sintel.getTitle()).isEqualTo("Sintel");
		assertThat(sintel.getLicense()).contains("CC BY 3.0");
		assertThat(sintel.getSource()).contains("Blender Foundation");
		assertThat(sintel.getLicenseProofUrl()).isEqualTo("https://durian.blender.org/sharing/");
		assertThat(sintel.getInfohash()).isEqualTo(SINTEL_INFOHASH);
		assertThat(sintel.getMagnetUri()).startsWith("magnet:?xt=urn:btih:" + SINTEL_INFOHASH);
		assertThat(sintel.getSizeBytes()).isEqualTo(129_302_391L);
	}

	@Test
	void replayingTheSeedNeverCreatesADuplicate() throws Exception {
		assertThat(entries.count()).isEqualTo(1);

		try (var connection = jdbc.getDataSource().getConnection()) {
			ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V2__seed_demo_catalogue.sql"));
			ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V2__seed_demo_catalogue.sql"));
		}

		assertThat(entries.count()).isEqualTo(1);
	}

	// --- Pas d'entrée sans licence ni preuve ----------------------------------------------------

	@Test
	void anEntryWithoutLicenceIsRejected() {
		assertThatThrownBy(() -> insertEntry(freshId(), "Film", "Source", null, PROOF, MAGNET, freshHash(), 10))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void anEntryWithABlankLicenceIsRejectedToo() {
		assertThatThrownBy(() -> insertEntry(freshId(), "Film", "Source", "   ", PROOF, MAGNET, freshHash(), 10))
				.isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> insertEntry(freshId(), "Film", "Source", "", PROOF, MAGNET, freshHash(), 10))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void anEntryWithoutProofOfTheLicenceIsRejected() {
		assertThatThrownBy(() -> insertEntry(freshId(), "Film", "Source", "CC BY 3.0", null, MAGNET, freshHash(), 10))
				.isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> insertEntry(freshId(), "Film", "Source", "CC BY 3.0", "pas une url", MAGNET, freshHash(), 10))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void anEntryWithoutSourceIsRejected() {
		assertThatThrownBy(() -> insertEntry(freshId(), "Film", null, "CC BY 3.0", PROOF, MAGNET, freshHash(), 10))
				.isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> insertEntry(freshId(), "Film", " ", "CC BY 3.0", PROOF, MAGNET, freshHash(), 10))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void aValidEntryIsAccepted() {
		assertThat(insertEntry(freshId(), "Film libre", "Source", "CC BY 3.0", PROOF, MAGNET, freshHash(), 10)).isEqualTo(1);
	}

	@Test
	void theJpaEntityCannotBypassTheRule() {
		CatalogueEntry noLicence = new CatalogueEntry("Film", "Source", " ", PROOF, MAGNET, freshHash(), 10);
		assertThatThrownBy(() -> entries.saveAndFlush(noLicence)).isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void malformedInfohashMagnetOrSizeAreRejected() {
		assertThatThrownBy(() -> insertEntry(freshId(), "Film", "S", "L", PROOF, MAGNET, "pas-un-hash", 10))
				.isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> insertEntry(freshId(), "Film", "S", "L", PROOF, "http://evil.example/x", freshHash(), 10))
				.isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> insertEntry(freshId(), "Film", "S", "L", PROOF, MAGNET, freshHash(), 0))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void twoEntriesCannotShareAnInfohash() {
		assertThatThrownBy(() -> insertEntry(freshId(), "Autre Sintel", "S", "L", PROOF, MAGNET, SINTEL_INFOHASH, 10))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	// --- Téléchargements ---------------------------------------------------------------------

	@Test
	void onlyOneActiveDownloadIsAllowedPerEntry() {
		UUID account = UUID.randomUUID();
		downloads.saveAndFlush(new Download(SINTEL_ID, account));   // QUEUED

		assertThatThrownBy(() -> downloads.saveAndFlush(new Download(SINTEL_ID, account)))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void aNewDownloadIsAllowedOnceThePreviousOneIsFinishedFailedOrCancelled() {
		UUID account = UUID.randomUUID();
		for (DownloadState finished : new DownloadState[] { DownloadState.COMPLETED, DownloadState.FAILED, DownloadState.CANCELLED }) {
			Download old = new Download(SINTEL_ID, account);
			old.setState(finished);
			downloads.saveAndFlush(old);
		}

		downloads.saveAndFlush(new Download(SINTEL_ID, account));   // un actif parmi plusieurs terminés : permis

		assertThat(downloads.findByEntryIdInAndStateIn(java.util.List.of(SINTEL_ID), DownloadState.ACTIVE)).hasSize(1);
	}

	@Test
	void downloadFieldsAreConstrained() {
		UUID account = UUID.randomUUID();
		Download tooFar = new Download(SINTEL_ID, account);
		tooFar.setProgressPercent(101);
		assertThatThrownBy(() -> downloads.saveAndFlush(tooFar)).isInstanceOf(DataIntegrityViolationException.class);

		Download traversal = new Download(SINTEL_ID, account);
		traversal.setState(DownloadState.COMPLETED);
		traversal.setFileRelativePath("../etc/passwd");
		assertThatThrownBy(() -> downloads.saveAndFlush(traversal)).isInstanceOf(DataIntegrityViolationException.class);

		Download absolute = new Download(SINTEL_ID, account);
		absolute.setState(DownloadState.COMPLETED);
		absolute.setFileRelativePath("/etc/passwd");
		assertThatThrownBy(() -> downloads.saveAndFlush(absolute)).isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void aDownloadMustPointToAnExistingEntry() {
		assertThatThrownBy(() -> downloads.saveAndFlush(new Download(UUID.randomUUID(), UUID.randomUUID())))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	// --- Acquittement du rappel des droits -----------------------------------------------------

	@Test
	void anAccountAcknowledgesEachNoticeVersionOnlyOnce() {
		UUID account = UUID.randomUUID();
		acknowledgements.saveAndFlush(new RightsAcknowledgement(account, "2026-11"));
		acknowledgements.saveAndFlush(new RightsAcknowledgement(account, "2026-12"));   // autre version : permis

		assertThat(acknowledgements.findAll()).hasSize(2);
		assertThatThrownBy(() -> jdbc.update(
				"insert into rights_acknowledgements (account_id, notice_version) values (?, ?)", account, "2026-11"))
				.isInstanceOf(DataIntegrityViolationException.class);
	}
}
