package com.homeflix.acquisition.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Erreurs MVC standard : code stable dédié (405, 406, 415) et `detail` fixe en français, sans reprendre ce que
 * le client a envoyé. Contrôleur de sonde, sans base ni sécurité.
 */
class HttpErrorCodesTests {

    @RestController
    static class Probe {
        @GetMapping(value = "/probe", produces = MediaType.APPLICATION_JSON_VALUE)
        String read() {
            return "{}";
        }

        @PostMapping(value = "/probe", consumes = MediaType.APPLICATION_JSON_VALUE)
        void write(@RequestBody String body) {
        }
    }

    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new Probe())
        .setControllerAdvice(new ProblemExceptionHandler()).build();

    @Test
    void wrongMethodGets405WithDedicatedCodeAndAllowHeader() throws Exception {
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/probe"))
            .andExpect(status().isMethodNotAllowed())
            .andExpect(header().exists("Allow"))
            .andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED"))
            .andExpect(jsonPath("$.detail").value("Cette méthode HTTP n'est pas autorisée sur cette ressource."));
    }

    @Test
    void unacceptableResponseTypeGets406WithDedicatedCode() throws Exception {
        mvc.perform(get("/probe").accept(MediaType.APPLICATION_XML))
            .andExpect(status().isNotAcceptable())
            .andExpect(jsonPath("$.code").value("NOT_ACCEPTABLE"));
    }

    @Test
    void unsupportedContentTypeGets415AndDoesNotEchoTheClientValue() throws Exception {
        String body = mvc.perform(post("/probe").contentType("text/x-valeur-du-client").content("x"))
            .andExpect(status().isUnsupportedMediaType())
            .andExpect(jsonPath("$.code").value("UNSUPPORTED_MEDIA_TYPE"))
            .andExpect(jsonPath("$.detail").value("Le type de contenu envoyé n'est pas pris en charge."))
            .andReturn().getResponse().getContentAsString();

        assertThat(body).doesNotContain("valeur-du-client");
    }
}
