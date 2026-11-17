package com.homeflix.library.identity;

import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Première communication interservices : Library récupère l'ensemble de clés publiques (JWKS)
 * d'Identity. La validation des jetons s'appuiera dessus (issue #41).
 */
@Component
public class IdentityClient {

    private static final Logger log = LoggerFactory.getLogger(IdentityClient.class);

    private final RestClient restClient;
    private final String jwksUri;

    public IdentityClient(RestClient.Builder builder,
                          @Value("${identity.jwks-uri}") String jwksUri) {
        this.restClient = builder.build();
        this.jwksUri = jwksUri;
    }

    /** Appelle l'endpoint JWKS d'Identity et renvoie la liste des clés publiques. */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> fetchSigningKeys() {
        Map<String, Object> jwks = restClient.get()
                .uri(jwksUri)
                .retrieve()
                .body(new ParameterizedTypeReference<Map<String, Object>>() { });
        List<Map<String, Object>> keys = jwks == null ? List.of() : (List<Map<String, Object>>) jwks.getOrDefault("keys", List.of());
        log.info("Library -> Identity : {} clé(s) publique(s) récupérée(s) depuis {}", keys.size(), jwksUri);
        return keys;
    }
}
