package com.homeflix.library.config;

import java.time.Duration;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.client.RestTemplate;

/**
 * Library est un resource server : les jetons RS256 émis par Identity sont validés (signature, expiration,
 * émetteur) avec le JWKS d'Identity, sans jamais lire sa base. /api/v1/admin/** est réservé au rôle ADMIN.
 */
@Configuration
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, ProblemAccessDeniedHandler accessDeniedHandler,
            ProblemAuthenticationEntryPoint entryPoint) throws Exception {
        http
            // API sans session ni cookie d'authentification : l'identité vient de l'en-tête Authorization.
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                // Le lecteur vidéo ne peut pas envoyer d'en-tête Authorization : l'accès est protégé par le ticket
                // de streaming signé (paramètre `t`), vérifié par StreamController.
                .requestMatchers(HttpMethod.GET, "/api/v1/stream/*").permitAll()
                // Même contrainte pour les affiches (balise <img>) : adresse signée, vérifiée par PosterController.
                .requestMatchers(HttpMethod.GET, "/api/v1/posters/*").permitAll()
                .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated())
            .oauth2ResourceServer(o -> o
                .jwt(j -> j.jwtAuthenticationConverter(jwtAuthenticationConverter()))
                .authenticationEntryPoint(entryPoint)
                .accessDeniedHandler(accessDeniedHandler))
            .exceptionHandling(e -> e
                .authenticationEntryPoint(entryPoint)
                .accessDeniedHandler(accessDeniedHandler))
            // Avant le filtre des jetons : Identity injoignable = 503 (voir IdentityUnavailableFilter).
            .addFilterBefore(new IdentityUnavailableFilter(), BearerTokenAuthenticationFilter.class)
            .httpBasic(AbstractHttpConfigurer::disable)
            .formLogin(AbstractHttpConfigurer::disable)
            .logout(AbstractHttpConfigurer::disable)
            .headers(Customizer.withDefaults());
        return http.build();
    }

    /**
     * Les clés sont chargées à la première validation (Library démarre même si Identity est arrêté), mises en
     * cache, et rechargées quand un jeton porte un `kid` inconnu (rotation de clé).
     *
     * <p>La récupération du JWKS a un délai d'attente court (3 s par défaut, `identity.jwks-timeout`). Sans cela,
     * le client par défaut attend 30 s : si Identity accepte la connexion sans répondre, chaque requête
     * authentifiée bloquerait 30 s (risque R15 : un service en panne ne doit pas faire tomber les autres).
     */
    @Bean
    JwtDecoder jwtDecoder(@Value("${identity.jwks-uri}") String jwksUri, @Value("${identity.issuer}") String issuer,
            @Value("${identity.jwks-timeout:3s}") Duration jwksTimeout) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(jwksTimeout);
        factory.setReadTimeout(jwksTimeout);
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(jwksUri).jwsAlgorithm(SignatureAlgorithm.RS256)
            .restOperations(new RestTemplate(factory)).build();
        decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(issuer));
        return decoder;
    }

    /** Le claim `roles` (USER/ADMIN) devient les autorités ROLE_USER / ROLE_ADMIN. */
    private static JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(jwt -> {
            List<String> roles = jwt.getClaimAsStringList("roles");
            return roles == null ? List.<GrantedAuthority>of()
                : roles.stream().<GrantedAuthority>map(r -> new SimpleGrantedAuthority("ROLE_" + r)).toList();
        });
        return converter;
    }
}
