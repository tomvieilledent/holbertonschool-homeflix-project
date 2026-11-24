package com.homeflix.identity.status;

import java.time.Instant;
import java.util.List;

/** État des services (contrat `SystemStatus`) : `status` global, puis un état par service. Rien d'autre. */
public record SystemStatusResponse(ServiceState status, Instant checkedAt, List<ServiceStatus> services) {

    public record ServiceStatus(String name, ServiceState status) {
    }
}
