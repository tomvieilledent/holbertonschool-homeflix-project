package com.homeflix.identity.status;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * Interroge `GET /actuator/health` d'un autre service, sur le réseau interne, avec des délais courts. Ce point est
 * public mais jamais routé par le proxy (voir nginx.conf) et ne détaille rien (`show-details=never`). Le statut du
 * service inclut déjà celui de sa base de données.
 */
class HttpServiceProbe implements ServiceProbe {

    private static final Logger log = LoggerFactory.getLogger(HttpServiceProbe.class);
    private static final ParameterizedTypeReference<Map<String, Object>> BODY = new ParameterizedTypeReference<>() {
    };

    private final String name;
    private final RestClient http;

    HttpServiceProbe(String name, String baseUrl, Duration timeout) {
        this.name = name;
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
            .connectTimeout(timeout).build());
        factory.setReadTimeout(timeout);
        this.http = RestClient.builder().baseUrl(baseUrl).requestFactory(factory).build();
    }

    @Override
    public String name() {
        return name;
    }

    @Override
    public ServiceState check() {
        try {
            Map<String, Object> body = http.get().uri("/actuator/health").retrieve().body(BODY);
            return body != null && "UP".equals(body.get("status")) ? ServiceState.UP : ServiceState.DOWN;
        } catch (RuntimeException e) {
            // Service arrêté, trop lent ou en erreur (503 inclus) : DOWN. Pas de détail dans la réponse de l'API.
            log.debug("Sonde {} : service indisponible ({})", name, e.getClass().getSimpleName());
            return ServiceState.DOWN;
        }
    }
}
