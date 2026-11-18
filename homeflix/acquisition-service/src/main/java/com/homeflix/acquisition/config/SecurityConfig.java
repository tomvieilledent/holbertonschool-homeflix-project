package com.homeflix.acquisition.config;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.client.RestTemplate;

/**
 * Acquisition est un resource server : les jetons RS256 émis par Identity sont validés (signature, expiration,
 * émetteur) avec le JWKS d'Identity, sans jamais lire sa base. Toutes les opérations de l'API (`/api/v1/**`) sont
 * réservées au rôle ADMIN (contrat `docs/api/acquisition.openapi.yaml`) ; seul /actuator/health est public.
 */
@Configuration
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, ProblemAccessDeniedHandler accessDeniedHandler,
            ProblemAuthenticationEntryPoint entryPoint) throws Exception {
        http
            // API sans session : l'identité vient de l'en-tête Authorization, donc pas de CSRF à ce stade.
            // À réexaminer avec le cookie de refresh d'Identity (issue #45).
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                .requestMatchers("/api/v1/**").hasRole("ADMIN")
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
     * Les clés sont chargées à la première validation (Acquisition démarre même si Identity est arrêté), mises en
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
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
            JwtValidators.createDefaultWithIssuer(issuer), subjectIsAnAccountId()));
        return decoder;
    }

    /** Le `sub` d'un jeton d'Identity est l'identifiant du compte (UUID) : sinon le jeton est refusé (401). */
    private static OAuth2TokenValidator<Jwt> subjectIsAnAccountId() {
        return jwt -> {
            try {
                UUID.fromString(jwt.getSubject());
                return OAuth2TokenValidatorResult.success();
            } catch (IllegalArgumentException | NullPointerException e) {
                return OAuth2TokenValidatorResult.failure(
                    new OAuth2Error("invalid_token", "Le sujet du jeton n'est pas un identifiant de compte", null));
            }
        };
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
