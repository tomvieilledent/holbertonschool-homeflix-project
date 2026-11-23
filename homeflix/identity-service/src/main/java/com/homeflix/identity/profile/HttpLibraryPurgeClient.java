package com.homeflix.identity.profile;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.homeflix.identity.error.ApiException;

/** Appel interne `POST /internal/purge` (ADR 0001) : secret partagé dans `X-Internal-Key`, jamais routé par le proxy. */
@Component
class HttpLibraryPurgeClient implements LibraryPurgeClient {

    private final RestClient http;
    private final String internalKey;

    HttpLibraryPurgeClient(@Value("${homeflix.library.url}") String libraryUrl,
            @Value("${homeflix.internal.api-key}") String internalKey) {
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(2)).build());
        factory.setReadTimeout(Duration.ofSeconds(5));
        this.http = RestClient.builder().baseUrl(libraryUrl).requestFactory(factory).build();
        this.internalKey = internalKey;
    }

    @Override
    public void purgeProfile(UUID profileId) {
        purge(Map.of("scope", "PROFILE", "profileId", profileId.toString()), "le profil n'a pas été supprimé");
    }

    @Override
    public void purgeAccount(UUID accountId) {
        purge(Map.of("scope", "ACCOUNT", "accountId", accountId.toString()), "le compte n'a pas été supprimé");
    }

    private void purge(Map<String, String> body, String consequence) {
        try {
            http.post().uri("/internal/purge")
                .header("X-Internal-Key", internalKey)
                .body(body)
                .retrieve().toBodilessEntity();
        } catch (RestClientException e) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "LIBRARY_UNAVAILABLE", "Library indisponible",
                "Library est injoignable : " + consequence + ". Réessayez plus tard.");
        }
    }
}
