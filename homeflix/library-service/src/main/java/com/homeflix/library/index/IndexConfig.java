package com.homeflix.library.index;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
class IndexConfig {

    /** Un seul thread : une seule indexation à la fois, hors du thread de la requête HTTP. */
    @Bean(name = "indexExecutor", destroyMethod = "shutdown")
    ExecutorService indexExecutor() {
        return Executors.newSingleThreadExecutor(runnable -> {
            Thread thread = new Thread(runnable, "library-index");
            thread.setDaemon(true);
            return thread;
        });
    }
}
