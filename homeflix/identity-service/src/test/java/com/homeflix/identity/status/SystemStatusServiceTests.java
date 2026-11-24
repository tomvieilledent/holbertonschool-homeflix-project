package com.homeflix.identity.status;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.Test;

/** Règle d'agrégation seule, sans réseau ni base : UP si tout est UP, DEGRADED dès qu'un service est DOWN. */
class SystemStatusServiceTests {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-11-23T12:00:00Z"), ZoneOffset.UTC);

    private static ServiceProbe probe(String name, ServiceState state) {
        return new ServiceProbe() {
            @Override public String name() { return name; }
            @Override public ServiceState check() { return state; }
        };
    }

    private static SystemStatusResponse status(ServiceProbe... probes) {
        return new SystemStatusService(List.of(probes), CLOCK).status();
    }

    @Test
    void allUpGivesUpAndKeepsTheOrderOfTheProbes() {
        SystemStatusResponse response = status(probe("identity", ServiceState.UP), probe("library", ServiceState.UP),
            probe("acquisition", ServiceState.UP));
        assertThat(response.status()).isEqualTo(ServiceState.UP);
        assertThat(response.checkedAt()).isEqualTo(Instant.parse("2026-11-23T12:00:00Z"));
        assertThat(response.services()).extracting(SystemStatusResponse.ServiceStatus::name)
            .containsExactly("identity", "library", "acquisition");
    }

    @Test
    void identityItselfDownMakesTheWholeDegraded() {
        SystemStatusResponse response = status(probe("identity", ServiceState.DOWN), probe("library", ServiceState.UP),
            probe("acquisition", ServiceState.UP));
        assertThat(response.status()).isEqualTo(ServiceState.DEGRADED);
        assertThat(response.services().get(0).status()).isEqualTo(ServiceState.DOWN);
    }

    @Test
    void oneDownServiceMakesTheWholeDegradedAndEveryServiceDownIsNeverAnOverallDown() {
        assertThat(status(probe("identity", ServiceState.UP), probe("library", ServiceState.DOWN),
            probe("acquisition", ServiceState.UP)).status()).isEqualTo(ServiceState.DEGRADED);
        assertThat(status(probe("identity", ServiceState.DOWN), probe("library", ServiceState.DOWN),
            probe("acquisition", ServiceState.DOWN)).status()).isEqualTo(ServiceState.DEGRADED);
    }

    @Test
    void aProbeThatThrowsIsDownAndDoesNotBreakTheOthers() {
        ServiceProbe broken = new ServiceProbe() {
            @Override public String name() { return "library"; }
            @Override public ServiceState check() { throw new IllegalStateException("boum"); }
        };
        SystemStatusResponse response = status(probe("identity", ServiceState.UP), broken,
            probe("acquisition", ServiceState.UP));
        assertThat(response.status()).isEqualTo(ServiceState.DEGRADED);
        assertThat(response.services()).extracting(SystemStatusResponse.ServiceStatus::status)
            .containsExactly(ServiceState.UP, ServiceState.DOWN, ServiceState.UP);
    }
}
