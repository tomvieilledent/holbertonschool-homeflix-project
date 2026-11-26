package com.homeflix.acquisition.library;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/** Client HTTP de Library : délai de 3 s par appel, 2 nouvelles tentatives (3 essais au total). */
@Component
class HttpLibraryClient implements LibraryClient {

    private static final Logger log = LoggerFactory.getLogger(HttpLibraryClient.class);
    private static final int ATTEMPTS = 3;

    private final RestClient http;
    private final String internalKey;
    private final long backoffMillis;

    HttpLibraryClient(@Value("${acquisition.library.url:http://library-service:8082}") String libraryUrl,
            @Value("${acquisition.library.internal-key:}") String internalKey,
            @Value("${acquisition.library.timeout:3s}") Duration timeout,
            @Value("${acquisition.library.retry-backoff:300ms}") Duration backoff) {
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
            HttpClient.newBuilder().connectTimeout(timeout).build());
        factory.setReadTimeout(timeout);
        this.http = RestClient.builder().baseUrl(libraryUrl).requestFactory(factory).build();
        this.internalKey = internalKey;
        this.backoffMillis = backoff.toMillis();
    }

    @Override
    public void registerCompleted(String relativePath, String title) {
        Map<String, String> body = Map.of("relativePath", relativePath, "title", title == null ? "" : title);
        for (int attempt = 1; attempt <= ATTEMPTS; attempt++) {
            try {
                http.post().uri("/internal/downloads/completed")
                    .header("X-Internal-Key", internalKey)
                    .body(body)
                    .retrieve().toBodilessEntity();
                return;
            } catch (HttpClientErrorException e) {
                log.warn("Library a refusé le fichier terminé (HTTP {})", e.getStatusCode().value());
                throw new LibraryRejectedException(); // une requête refusée ne se rejoue pas
            } catch (RestClientException e) {
                log.warn("Appel à Library en échec (essai {}/{})", attempt, ATTEMPTS);
                if (attempt < ATTEMPTS) {
                    pause();
                }
            }
        }
        throw new LibraryUnavailableException();
    }

    private void pause() {
        try {
            Thread.sleep(backoffMillis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new LibraryUnavailableException();
        }
    }
}
