package com.homeflix.acquisition.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/** Purge d'un compte : secret interne exigé, données du seul compte visé, appel rejouable. */
@SpringBootTest(properties = "acquisition.library.internal-key=cle-de-test")
@AutoConfigureMockMvc
@Testcontainers
class InternalPurgeIntegrationTests {

	private static final UUID SINTEL_ID = UUID.fromString("7d1c0a52-3f6e-4b8a-9c21-0f4a6e2b1d11");

	@Container
	static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

	@DynamicPropertySource
	static void datasource(DynamicPropertyRegistry registry) {
		registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
		registry.add("spring.datasource.username", POSTGRES::getUsername);
		registry.add("spring.datasource.password", POSTGRES::getPassword);
	}

	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;

	private static MockHttpServletRequestBuilder purge(UUID account) {
		return post("/internal/purge").contentType(MediaType.APPLICATION_JSON)
				.content("{\"accountId\":\"" + account + "\"}");
	}

	@Test
	void withoutTheInternalKeyTheCallIsRefused() throws Exception {
		UUID account = UUID.randomUUID();
		mvc.perform(purge(account)).andExpect(status().isUnauthorized());
		mvc.perform(purge(account).header("X-Internal-Key", "mauvaise")).andExpect(status().isUnauthorized());
		mvc.perform(purge(account).with(jwt())).andExpect(status().isForbidden());
	}

	@Test
	void purgingRemovesOnlyThatAccountAndCanBeReplayed() throws Exception {
		UUID gone = UUID.randomUUID();
		UUID kept = UUID.randomUUID();
		for (UUID account : new UUID[] { gone, kept }) {
			jdbc.update("insert into rights_acknowledgements (account_id, notice_version) values (?, '2026-11')", account);
			jdbc.update("insert into downloads (id, entry_id, requested_by, state) values (?, ?, ?, 'CANCELLED')",
					UUID.randomUUID(), SINTEL_ID, account);
		}

		mvc.perform(purge(gone).header("X-Internal-Key", "cle-de-test")).andExpect(status().isNoContent());
		mvc.perform(purge(gone).header("X-Internal-Key", "cle-de-test")).andExpect(status().isNoContent());

		assertThat(jdbc.queryForList("select account_id from rights_acknowledgements", UUID.class)).containsExactly(kept);
		assertThat(jdbc.queryForList("select requested_by from downloads", UUID.class))
				.containsExactlyInAnyOrder(kept, AccountPurgeService.DELETED_ACCOUNT);
	}
}
