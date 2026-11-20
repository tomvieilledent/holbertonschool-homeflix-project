package com.homeflix.acquisition.torrent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.homeflix.acquisition.api.ProblemExceptionHandler;

/**
 * Une route qui laisse remonter l'erreur du client BitTorrent (futurs endpoints de téléchargement, #88) répond le
 * 503 `TORRENT_CLIENT_UNAVAILABLE` du contrat, en problem+json et sans détail technique.
 */
class TorrentClientUnavailableApiTests {

    /** Faux client en panne : c'est ce que les endpoints verront quand Transmission est arrêté. */
    private static final TorrentClient STOPPED = new TorrentClient() {
        @Override
        public String add(String magnetUri) {
            throw new TorrentClientUnavailableException();
        }

        @Override
        public Optional<TorrentStatus> status(String torrentId) {
            throw new TorrentClientUnavailableException();
        }

        @Override
        public void cancel(String torrentId) {
            throw new TorrentClientUnavailableException();
        }
    };

    @RestController
    static class Probe {
        @GetMapping("/probe")
        String probe() {
            return STOPPED.status("0".repeat(40)).toString();
        }
    }

    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new Probe())
        .setControllerAdvice(new ProblemExceptionHandler()).build();

    @Test
    void aStoppedClientGives503WithTheContractCode() throws Exception {
        mvc.perform(get("/probe"))
            .andExpect(status().isServiceUnavailable())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.code").value("TORRENT_CLIENT_UNAVAILABLE"))
            .andExpect(jsonPath("$.detail").value("Le service de téléchargement est momentanément indisponible. Réessayez plus tard."));
    }

    @Test
    void theResponseRevealsNothingAboutTheClient() throws Exception {
        String body = mvc.perform(get("/probe")).andReturn().getResponse().getContentAsString();

        assertThat(body).doesNotContain("transmission", "9091", "rpc", "Exception");
    }
}
