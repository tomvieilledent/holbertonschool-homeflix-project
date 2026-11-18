package com.homeflix.acquisition.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;

/**
 * Active `@PreAuthorize` : toutes les opérations du contrat Acquisition sont réservées au rôle ADMIN. La règle est
 * posée sur chaque contrôleur, donc elle protège les routes même si la configuration des routes évolue.
 */
@Configuration
@EnableMethodSecurity
public class MethodSecurityConfig {
}
