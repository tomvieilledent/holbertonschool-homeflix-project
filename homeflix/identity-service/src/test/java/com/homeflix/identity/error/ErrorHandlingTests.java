package com.homeflix.identity.error;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.homeflix.identity.auth.AuthService;
import com.homeflix.identity.setup.SetupService;

/**
 * Une faute du client (mauvaise méthode, type de contenu ou réponse demandés non gérés) doit rendre son vrai
 * statut 4xx, pas un 500 « erreur interne ». Seule une vraie panne du serveur donne un 500, sans détail technique.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ErrorHandlingTests {

    @MockitoBean SetupService setupService;
    @MockitoBean AuthService authService;

    @Autowired
    MockMvc mvc;

    @Test
    void wrongHttpMethodGets405WithAllowHeaderAndProblemJson() throws Exception {
        mvc.perform(post("/.well-known/jwks.json"))
            .andExpect(status().isMethodNotAllowed())
            .andExpect(header().string("Allow", org.hamcrest.Matchers.containsString("GET")))
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.status").value(405))
            .andExpect(jsonPath("$.code").exists());
    }

    @Test
    void unacceptableResponseTypeGets406() throws Exception {
        mvc.perform(get("/.well-known/jwks.json").accept(MediaType.APPLICATION_XML))
            .andExpect(status().isNotAcceptable())
            .andExpect(jsonPath("$.code").exists());
    }

    @Test
    void unsupportedRequestContentTypeGets415() throws Exception {
        mvc.perform(post("/api/v1/setup").contentType(MediaType.TEXT_PLAIN).content("x"))
            .andExpect(status().isUnsupportedMediaType())
            .andExpect(jsonPath("$.code").exists());
    }

    @Test
    void clientErrorsAreNotReportedAsInternalErrors() throws Exception {
        mvc.perform(post("/.well-known/jwks.json"))
            .andExpect(jsonPath("$.code").value(org.hamcrest.Matchers.not("INTERNAL_ERROR")));
    }

    @Test
    void realServerFailureStillGets500WithoutTechnicalDetail() throws Exception {
        when(setupService.status()).thenThrow(new IllegalStateException("détail interne secret"));

        mvc.perform(get("/api/v1/setup/status"))
            .andExpect(status().isInternalServerError())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
            .andExpect(jsonPath("$.detail").value("Une erreur inattendue s'est produite."))
            .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("secret"))))
            .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("IllegalState"))));
    }

    @Test
    void unknownRouteStillGets404NotFound() throws Exception {
        mvc.perform(get("/api/v1/does-not-exist").with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user("u").roles("USER")))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }
}
