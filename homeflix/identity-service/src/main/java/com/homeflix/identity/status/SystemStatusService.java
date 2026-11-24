package com.homeflix.identity.status;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.springframework.stereotype.Service;

import jakarta.annotation.PreDestroy;

/**
 * Agrège l'état des trois services. Règle : chaque service est UP ou DOWN ; l'ensemble est UP si les trois sont UP,
 * DEGRADED dès qu'un seul est DOWN (Identity compris, par exemple si sa base ne répond pas). Cette API ne répondant que
 * si Identity tourne, l'ensemble n'est jamais DOWN : un Identity arrêté se voit à l'absence de réponse.
 *
 * <p>Les sondes tournent en parallèle et le total est borné : une sonde qui dépasse {@link #LIMIT_MILLIS} est DOWN.
 */
@Service
public class SystemStatusService {

    /** Un peu plus que le délai de chaque sonde, pour qu'un service bloqué ne retarde jamais la réponse au-delà. */
    static final long LIMIT_MILLIS = 3_000;

    private final List<ServiceProbe> probes;
    private final Clock clock;
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    public SystemStatusService(List<ServiceProbe> probes, Clock clock) {
        this.probes = probes;
        this.clock = clock;
    }

    public SystemStatusResponse status() {
        List<CompletableFuture<SystemStatusResponse.ServiceStatus>> futures = probes.stream()
            .map(probe -> CompletableFuture
                .supplyAsync(() -> new SystemStatusResponse.ServiceStatus(probe.name(), probe.check()), executor)
                .completeOnTimeout(new SystemStatusResponse.ServiceStatus(probe.name(), ServiceState.DOWN),
                    LIMIT_MILLIS, TimeUnit.MILLISECONDS)
                .exceptionally(e -> new SystemStatusResponse.ServiceStatus(probe.name(), ServiceState.DOWN)))
            .toList();
        List<SystemStatusResponse.ServiceStatus> services = futures.stream().map(CompletableFuture::join).toList();
        boolean allUp = services.stream().allMatch(s -> s.status() == ServiceState.UP);
        return new SystemStatusResponse(allUp ? ServiceState.UP : ServiceState.DEGRADED, Instant.now(clock), services);
    }

    @PreDestroy
    void close() {
        executor.shutdownNow();
    }
}
