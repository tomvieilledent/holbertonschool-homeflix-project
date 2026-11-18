package com.homeflix.identity.config;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;

import com.homeflix.identity.error.ProblemResponses;
import com.homeflix.identity.security.JwtProperties;
import com.homeflix.identity.security.SigningKeyProvider;

/**
 * Chaîne de sécurité stateless. Routes publiques : setup, connexion, refresh, JWKS et santé ; le reste
 * exige une authentification, et /api/v1/admin/** le rôle ADMIN. Les 401/403 sont en problem+json.
 * La validation des jetons JWT est branchée par l'issue #36.
 */
@Configuration
@EnableMethodSecurity
@EnableConfigurationProperties(JwtProperties.class)
public class SecurityConfig {

    private static final AuthenticationEntryPoint ENTRY_POINT = (req, res, ex) -> ProblemResponses.write(res,
        HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "Authentification requise", "Authentification requise.");

    private static final AccessDeniedHandler DENIED_HANDLER = (req, res, ex) -> ProblemResponses.write(res,
        HttpStatus.FORBIDDEN, "ACCESS_DENIED", "Accès refusé", "Accès refusé.");

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            // API sans session : l'authentification passe par l'en-tête Authorization. Le cookie de refresh
            // est protégé par l'en-tête X-Requested-With (voir ADR 0001 et issue #45).
            .csrf(AbstractHttpConfigurer::disable)
            .cors(Customizer.withDefaults())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                .requestMatchers("/.well-known/jwks.json").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/v1/setup/status").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/v1/setup", "/api/v1/auth/login", "/api/v1/auth/refresh")
                    .permitAll()
                .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated())
            .oauth2ResourceServer(o -> o
                .jwt(j -> j.jwtAuthenticationConverter(jwtAuthenticationConverter()))
                .authenticationEntryPoint(ENTRY_POINT)
                .accessDeniedHandler(DENIED_HANDLER))
            .exceptionHandling(e -> e
                .authenticationEntryPoint(ENTRY_POINT)
                .accessDeniedHandler(DENIED_HANDLER))
            .httpBasic(AbstractHttpConfigurer::disable)
            .formLogin(AbstractHttpConfigurer::disable)
            .logout(AbstractHttpConfigurer::disable)
            .headers(h -> h
                .contentTypeOptions(Customizer.withDefaults())
                .frameOptions(f -> f.deny())
                .referrerPolicy(r -> r.policy(ReferrerPolicy.NO_REFERRER))
                .contentSecurityPolicy(c -> c.policyDirectives("default-src 'none'; frame-ancestors 'none'")));
        return http.build();
    }

    /** Valide les jetons émis par ce service (signature RS256, expiration, émetteur). */
    @Bean
    JwtDecoder jwtDecoder(SigningKeyProvider keys, JwtProperties props) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withPublicKey(keys.publicKey())
            .signatureAlgorithm(SignatureAlgorithm.RS256).build();
        decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(props.issuer()));
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

    /** Argon2id (paramètres recommandés par Spring Security 5.8+). */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8();
    }

    /**
     * CORS : fermé par défaut (le frontend passe par le proxy, même origine). Les origines autorisées
     * s'ajoutent via homeflix.cors.allowed-origins (liste explicite, jamais de joker).
     */
    @Bean
    CorsConfigurationSource corsConfigurationSource(
            @Value("${homeflix.cors.allowed-origins:}") List<String> allowedOrigins) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(allowedOrigins.stream().filter(o -> !o.isBlank()).toList());
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-Requested-With"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
