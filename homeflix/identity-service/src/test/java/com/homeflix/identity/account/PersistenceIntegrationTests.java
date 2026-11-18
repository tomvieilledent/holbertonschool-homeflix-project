package com.homeflix.identity.account;

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

/**
 * Migrations Flyway et repositories sur un vrai PostgreSQL (Testcontainers).
 * Le démarrage du contexte vérifie aussi `ddl-auto=validate` : les entités correspondent au schéma.
 */
@SpringBootTest(properties = { "homeflix.jwt.generate-if-missing=true", "homeflix.setup.init-on-startup=false" })
@Testcontainers
class PersistenceIntegrationTests {

	@Container
	static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

	@DynamicPropertySource
	static void datasource(DynamicPropertyRegistry registry) {
		registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
		registry.add("spring.datasource.username", POSTGRES::getUsername);
		registry.add("spring.datasource.password", POSTGRES::getPassword);
	}

	@Autowired AccountRepository accounts;
	@Autowired ProfileRepository profiles;
	@Autowired RefreshTokenRepository tokens;
	@Autowired RoleRepository roles;
	@Autowired SetupStateRepository setupStates;
	@Autowired JdbcTemplate jdbc;

	@AfterEach
	void clean() {
		tokens.deleteAll();
		profiles.deleteAll();
		accounts.deleteAll();
		setupStates.deleteAll();
	}

	private Account newAccount(String username) {
		return accounts.save(new Account(username, username + "@homeflix.local", "$argon2id$hash", roles.getReferenceById(Role.USER)));
	}

	@Test
	void migrationSeedsTheTwoRoles() {
		assertThat(roles.findAll()).extracting(Role::getName).containsExactlyInAnyOrder("USER", "ADMIN");
	}

	@Test
	void storesOnlyHashes() {
		List<String> sensitive = jdbc.queryForList(
				"SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' "
						+ "AND (column_name LIKE '%password%' OR column_name LIKE '%token%')", String.class);
		assertThat(sensitive).isNotEmpty().allMatch(c -> c.endsWith("_hash") || c.equals("must_change_password"));
	}

	@Test
	void savesAndReadsAnAccountWithProfiles() {
		Account account = newAccount("alice");
		profiles.save(new Profile(account, "Alice", "avatar-1"));
		profiles.save(new Profile(account, "Enfants", "avatar-kids"));

		assertThat(accounts.findByUsername("alice")).isPresent().get()
				.satisfies(a -> {
					assertThat(a.isEnabled()).isTrue();
					assertThat(a.getRole().getName()).isEqualTo("USER");
					assertThat(a.getCreatedAt()).isNotNull();
				});
		assertThat(profiles.countByAccountId(account.getId())).isEqualTo(2);
		assertThat(accounts.countByRoleNameAndEnabledTrue("ADMIN")).isZero();
	}

	@Test
	void rejectsDuplicateUsernameAndProfileName() {
		Account account = newAccount("bruno");
		profiles.save(new Profile(account, "Bruno", "avatar-2"));

		assertThatThrownBy(() -> newAccount("bruno")).isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> profiles.saveAndFlush(new Profile(account, "Bruno", "avatar-3")))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void deletingAnAccountCascadesToProfilesAndTokens() {
		Account account = newAccount("carla");
		profiles.save(new Profile(account, "Carla", "avatar-1"));
		tokens.save(new RefreshToken(account, UUID.randomUUID(), "sha256-hash-1", Instant.now().plusSeconds(3600)));

		accounts.deleteById(account.getId());

		assertThat(profiles.count()).isZero();
		assertThat(tokens.count()).isZero();
	}

	@Test
	void refreshTokenIsFoundByHashAndRevocable() {
		Account account = newAccount("dora");
		UUID family = UUID.randomUUID();
		tokens.save(new RefreshToken(account, family, "sha256-hash-2", Instant.now().plusSeconds(3600)));

		RefreshToken found = tokens.findByTokenHash("sha256-hash-2").orElseThrow();
		found.revoke(Instant.now());
		tokens.save(found);

		assertThat(tokens.findByFamilyId(family)).singleElement().satisfies(t -> assertThat(t.getRevokedAt()).isNotNull());
		assertThatThrownBy(() -> tokens.saveAndFlush(new RefreshToken(account, family, "sha256-hash-2", Instant.now())))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void setupStateIsASingleRowAndInvalidatesTheTokenOnCompletion() {
		setupStates.save(new SetupState("sha256-setup-token"));
		SetupState state = setupStates.findAll().get(0);
		assertThat(state.isCompleted()).isFalse();

		state.complete(Instant.now());
		setupStates.save(state);

		assertThat(setupStates.findAll()).singleElement().satisfies(s -> {
			assertThat(s.isCompleted()).isTrue();
			assertThat(s.getTokenHash()).isNull();
		});
		assertThatThrownBy(() -> jdbc.update("INSERT INTO setup_state (singleton) VALUES (FALSE)"))
				.isInstanceOf(DataIntegrityViolationException.class);
	}
}
