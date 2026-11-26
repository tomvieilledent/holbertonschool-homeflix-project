package com.homeflix.acquisition.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;

import com.homeflix.acquisition.internal.InternalKeyFilter;

/**
 * Chaîne dédiée à `/internal/**` : le secret partagé remplace le JWT (les services n'ont pas de compte). Sans le
 * bon secret : 401. Le reverse proxy ne route jamais ces chemins (404 depuis l'extérieur).
 */
@Configuration
public class InternalSecurityConfig {

    @Bean
    @Order(1)
    SecurityFilterChain internalFilterChain(HttpSecurity http, ProblemAuthenticationEntryPoint entryPoint,
            ProblemAccessDeniedHandler accessDeniedHandler,
            @Value("${acquisition.library.internal-key:}") String apiKey) throws Exception {
        http
            .securityMatcher("/internal/**")
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth.anyRequest().hasRole("SERVICE"))
            .addFilterBefore(new InternalKeyFilter(apiKey), AnonymousAuthenticationFilter.class)
            .exceptionHandling(e -> e.authenticationEntryPoint(entryPoint).accessDeniedHandler(accessDeniedHandler))
            .httpBasic(AbstractHttpConfigurer::disable)
            .formLogin(AbstractHttpConfigurer::disable)
            .logout(AbstractHttpConfigurer::disable);
        return http.build();
    }
}
