package com.homeflix.acquisition.torrent;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(TransmissionProperties.class)
public class TorrentConfig {

    @Bean
    TorrentClient torrentClient(TransmissionProperties properties) {
        return new TransmissionClient(properties);
    }
}
