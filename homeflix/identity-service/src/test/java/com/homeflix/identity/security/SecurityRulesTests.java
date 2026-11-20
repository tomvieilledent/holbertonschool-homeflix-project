package com.homeflix.identity.security;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.homeflix.identity.auth.AuthService;
import com.homeflix.identity.setup.SetupService;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SecurityRulesTests {

    @MockitoBean SetupService setupService;
    @MockitoBean AuthService authService;
    @MockitoBean com.homeflix.identity.admin.AdminAccountService adminAccountService;

    @Autowired
    MockMvc mvc;

    @Test
    void anonymousOnProtectedRouteGets401ProblemJson() throws Exception {
        mvc.perform(get("/api/v1/profiles"))
            .andExpect(status().isUnauthorized())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.status").value(401))
            .andExpect(jsonPath("$.code").exists())
            .andExpect(jsonPath("$.trace").doesNotExist())
            .andExpect(jsonPath("$.exception").doesNotExist());
    }

    @Test
    @WithMockUser(roles = "USER")
    void userOnAdminRouteGets403() throws Exception {
        mvc.perform(get("/api/v1/admin/accounts"))
            .andExpect(status().isForbidden())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void adminPassesSecurityOnAdminRoute() throws Exception {
        // Route inexistante sous /admin : 404 problem+json (et non 401/403) prouve que la sécurité a laissé passer.
        mvc.perform(get("/api/v1/admin/inconnu"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void publicRoutesAreNotBlockedBySecurity() throws Exception {
        mvc.perform(get("/api/v1/setup/status")).andExpect(status().isOk());
        mvc.perform(get("/.well-known/jwks.json")).andExpect(status().isOk());
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
    }

    @Test
    void securityHeadersArePresent() throws Exception {
        mvc.perform(get("/actuator/health"))
            .andExpect(header().string("X-Content-Type-Options", "nosniff"))
            .andExpect(header().string("X-Frame-Options", "DENY"))
            .andExpect(header().exists("Content-Security-Policy"))
            .andExpect(header().string("Referrer-Policy", "no-referrer"));
    }
}
