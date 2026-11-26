package com.homeflix.acquisition.library;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

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

    private record MediaId(UUID mediaId) { }

    private record MediaIds(List<UUID> mediaIds) { }

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
    public UUID registerCompleted(String relativePath, String title) {
        MediaId reply = post("/internal/downloads/completed", relativePath, title);
        if (reply == null || reply.mediaId() == null) {
            throw new LibraryUnavailableException(); // réponse illisible : le fichier n'est pas considéré comme reçu
        }
        return reply.mediaId();
    }

    @Override
    public Set<UUID> present(Collection<UUID> mediaIds) {
        try {
            MediaIds reply = http.post().uri("/internal/media/present")
                .header("X-Internal-Key", internalKey)
                .body(new MediaIds(List.copyOf(mediaIds)))
                .retrieve().body(MediaIds.class);
            if (reply == null || reply.mediaIds() == null) {
                throw new LibraryUnavailableException();
            }
            return Set.copyOf(reply.mediaIds());
        } catch (RestClientException e) {
            log.warn("Library ne dit pas quels médias sont présents");
            throw new LibraryUnavailableException();
        }
    }

    @Override
    public void registerDownloading(String relativePath, String title) {
        post("/internal/downloads", relativePath, title);
    }

    @Override
    public void registerFailed(String relativePath) {
        post("/internal/downloads/failed", relativePath, null);
    }

    private MediaId post(String uri, String relativePath, String title) {
        Map<String, String> body = Map.of("relativePath", relativePath, "title", title == null ? "" : title);
        for (int attempt = 1; attempt <= ATTEMPTS; attempt++) {
            try {
                return http.post().uri(uri)
                    .header("X-Internal-Key", internalKey)
                    .body(body)
                    .retrieve().body(MediaId.class); // null pour une réponse sans corps (204)
            } catch (HttpClientErrorException e) {
                log.warn("Library a refusé l'appel {} (HTTP {})", uri, e.getStatusCode().value());
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
