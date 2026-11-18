package com.homeflix.identity.config;

import java.time.Clock;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.homeflix.identity.auth.AuthProperties;

/** Horloge injectable (les tests d'expiration la remplacent) et propriétés d'authentification. */
@Configuration
@EnableConfigurationProperties(AuthProperties.class)
public class ClockConfig {

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
