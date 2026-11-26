package com.homeflix.identity.account;

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

/** Appel interne `POST /internal/purge` d'Acquisition : mêmes secret et délais que la purge vers Library. */
@Component
class HttpAcquisitionPurgeClient implements AcquisitionPurgeClient {

    private final RestClient http;
    private final String internalKey;

    HttpAcquisitionPurgeClient(@Value("${homeflix.acquisition.url}") String acquisitionUrl,
            @Value("${homeflix.internal.api-key}") String internalKey) {
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(2)).build());
        factory.setReadTimeout(Duration.ofSeconds(5));
        this.http = RestClient.builder().baseUrl(acquisitionUrl).requestFactory(factory).build();
        this.internalKey = internalKey;
    }

    @Override
    public void purgeAccount(UUID accountId) {
        try {
            http.post().uri("/internal/purge")
                .header("X-Internal-Key", internalKey)
                .body(Map.of("accountId", accountId.toString()))
                .retrieve().toBodilessEntity();
        } catch (RestClientException e) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "ACQUISITION_UNAVAILABLE", "Acquisition indisponible",
                "Acquisition est injoignable : le compte n'a pas été supprimé. Réessayez plus tard.");
        }
    }
}
