package com.homeflix.identity.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.homeflix.identity.account.Account;
import com.homeflix.identity.account.AccountRepository;
import com.homeflix.identity.account.Role;
import com.homeflix.identity.account.RoleRepository;
import com.homeflix.identity.security.JwtService;

import jakarta.servlet.http.Cookie;

@SpringBootTest(properties = {
        "homeflix.jwt.generate-if-missing=true",
        "homeflix.setup.init-on-startup=false" })
@AutoConfigureMockMvc
@Testcontainers
class AdminAccountIntegrationTests {

    private static final String PASSWORD = String.join("-", "mot", "de", "passe", "de", "test");
    private static final String TEMP = String.join("-", "temporaire", "a", "changer", "42");

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
    @Autowired AccountRepository accounts;
    @Autowired RoleRepository roles;
    @Autowired PasswordEncoder encoder;
    @Autowired JwtService jwt;

    Account admin;
    Account user;

    @BeforeEach
    void reset() {
        jdbc.update("DELETE FROM accounts");
        admin = account("root", Role.ADMIN);
        user = account("alice", Role.USER);
    }

    private Account account(String name, String role) {
        return accounts.save(new Account(name, name + "@maison.fr", encoder.encode(PASSWORD), roles.getReferenceById(role)));
    }

    private String bearer(Account a) {
        return "Bearer " + jwt.issueAccessToken(a.getId(), List.of(a.getRole().getName()), null);
    }

    private ResultActions patchAccount(Account actor, UUID target, String body) throws Exception {
        return mvc.perform(patch("/api/v1/admin/accounts/" + target).header("Authorization", bearer(actor))
            .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private ResultActions login(String username, String password) throws Exception {
        return mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"));
    }

    @Test
    void aUserGets403OnEveryAdminRoute() throws Exception {
        String h = bearer(user);
        String other = UUID.randomUUID().toString();
        mvc.perform(get("/api/v1/admin/accounts").header("Authorization", h)).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/accounts/" + other).header("Authorization", h)).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/admin/accounts").header("Authorization", h).contentType(MediaType.APPLICATION_JSON)
            .content("{}")).andExpect(status().isForbidden());
        patchAccount(user, user.getId(), "{\"role\":\"ADMIN\"}").andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/admin/accounts/" + other + "/password-reset").header("Authorization", h)
            .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
        assertThat(accounts.findById(user.getId())).get().extracting(a -> a.getRole().getName()).isEqualTo(Role.USER);
    }

    @Test
    void anonymousGets401() throws Exception {
        mvc.perform(get("/api/v1/admin/accounts")).andExpect(status().isUnauthorized());
    }

    @Test
    void adminListsWithPaginationAndNeverSeesHashes() throws Exception {
        mvc.perform(get("/api/v1/admin/accounts?size=1").header("Authorization", bearer(admin)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(2)).andExpect(jsonPath("$.totalPages").value(2))
            .andExpect(jsonPath("$.items.length()").value(1))
            .andExpect(jsonPath("$.items[0].passwordHash").doesNotExist());
        mvc.perform(get("/api/v1/admin/accounts?size=0").header("Authorization", bearer(admin)))
            .andExpect(status().isBadRequest());
    }

    @Test
    void adminCreatesAnAccountWhoCanLogIn() throws Exception {
        mvc.perform(post("/api/v1/admin/accounts").header("Authorization", bearer(admin))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"bob\",\"email\":\"Bob@Maison.fr\",\"password\":\"" + PASSWORD + "\",\"role\":\"USER\"}"))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.role").value("USER"))
            .andExpect(jsonPath("$.email").value("bob@maison.fr"));
        login("bob", PASSWORD).andExpect(status().isOk());
    }

    @Test
    void creatingWithATakenUsernameOrEmailOrBadInputIsRejected() throws Exception {
        String body = "{\"username\":\"%s\",\"email\":\"%s\",\"password\":\"" + PASSWORD + "\",\"role\":\"%s\"}";
        mvc.perform(post("/api/v1/admin/accounts").header("Authorization", bearer(admin))
            .contentType(MediaType.APPLICATION_JSON).content(body.formatted("alice", "autre@maison.fr", "USER")))
            .andExpect(status().isConflict());
        mvc.perform(post("/api/v1/admin/accounts").header("Authorization", bearer(admin))
            .contentType(MediaType.APPLICATION_JSON).content(body.formatted("neo", "ALICE@maison.fr", "USER")))
            .andExpect(status().isConflict());
        mvc.perform(post("/api/v1/admin/accounts").header("Authorization", bearer(admin))
            .contentType(MediaType.APPLICATION_JSON).content(body.formatted("neo", "neo@maison.fr", "ROOT")))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void disablingAnAccountBlocksLoginAndRefreshImmediately() throws Exception {
        var res = login("alice", PASSWORD).andExpect(status().isOk()).andReturn();
        String cookie = res.getResponse().getHeader(HttpHeaders.SET_COOKIE).split(";")[0].split("=", 2)[1];

        patchAccount(admin, user.getId(), "{\"enabled\":false}")
            .andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(false));

        login("alice", PASSWORD).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ACCOUNT_DISABLED"));
        mvc.perform(post("/api/v1/auth/refresh").header("X-Requested-With", "homeflix")
                .cookie(new Cookie("refresh_token", cookie)))
            .andExpect(status().is4xxClientError());
        assertThat(jdbc.queryForObject(
            "select count(*) from refresh_tokens where account_id = ? and revoked_at is null", Integer.class, user.getId()))
            .isZero();
    }

    @Test
    void theLastAdminCannotBeDisabledOrDemoted() throws Exception {
        patchAccount(admin, admin.getId(), "{\"enabled\":false}")
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LAST_ADMIN"));
        patchAccount(admin, admin.getId(), "{\"role\":\"USER\"}")
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LAST_ADMIN"));
        assertThat(accounts.findById(admin.getId())).get().satisfies(a -> {
            assertThat(a.isEnabled()).isTrue();
            assertThat(a.getRole().getName()).isEqualTo(Role.ADMIN);
        });
    }

    @Test
    void anAdminCanBeDemotedWhenAnotherEnabledAdminExists() throws Exception {
        Account second = account("second", Role.ADMIN);
        patchAccount(admin, second.getId(), "{\"role\":\"USER\"}").andExpect(status().isOk())
            .andExpect(jsonPath("$.role").value("USER"));
        // « root » est de nouveau le seul administrateur actif.
        patchAccount(admin, admin.getId(), "{\"enabled\":false}").andExpect(status().isConflict());
    }

    @Test
    void aDisabledAdminDoesNotCountAsAvailable() throws Exception {
        Account second = account("second", Role.ADMIN);
        patchAccount(admin, second.getId(), "{\"enabled\":false}").andExpect(status().isOk());
        patchAccount(admin, admin.getId(), "{\"role\":\"USER\"}").andExpect(status().isConflict());
    }

    @Test
    void promotingAUserWorksAndEmptyPatchIsRejected() throws Exception {
        patchAccount(admin, user.getId(), "{\"role\":\"ADMIN\"}").andExpect(status().isOk())
            .andExpect(jsonPath("$.role").value("ADMIN"));
        patchAccount(admin, user.getId(), "{}").andExpect(status().isBadRequest());
        patchAccount(admin, UUID.randomUUID(), "{\"enabled\":true}").andExpect(status().isNotFound());
    }

    @Test
    void passwordResetSetsTemporaryPasswordForcesChangeAndCutsSessions() throws Exception {
        var res = login("alice", PASSWORD).andExpect(status().isOk()).andReturn();
        assertThat(res.getResponse().getHeader(HttpHeaders.SET_COOKIE)).isNotNull();

        mvc.perform(post("/api/v1/admin/accounts/" + user.getId() + "/password-reset")
                .header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"temporaryPassword\":\"" + TEMP + "\"}"))
            .andExpect(status().isNoContent());

        login("alice", PASSWORD).andExpect(status().isUnauthorized());
        login("alice", TEMP).andExpect(status().isOk());
        mvc.perform(get("/api/v1/admin/accounts/" + user.getId()).header("Authorization", bearer(admin)))
            .andExpect(jsonPath("$.mustChangePassword").value(true));
    }

    @Test
    void passwordResetValidatesAndFindsTheAccount() throws Exception {
        mvc.perform(post("/api/v1/admin/accounts/" + user.getId() + "/password-reset")
                .header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"temporaryPassword\":\"court\"}"))
            .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/admin/accounts/" + UUID.randomUUID() + "/password-reset")
                .header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"temporaryPassword\":\"" + TEMP + "\"}"))
            .andExpect(status().isNotFound());
    }
}
