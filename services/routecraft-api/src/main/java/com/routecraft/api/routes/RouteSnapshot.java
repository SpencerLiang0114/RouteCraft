package com.routecraft.api.routes;

import java.math.BigDecimal;
import java.time.Instant;

import tools.jackson.databind.JsonNode;

record RouteSnapshot(
        String id,
        String source,
        String name,
        String activity,
        String routeType,
        BigDecimal distanceKm,
        int estimatedDurationMin,
        BigDecimal elevationGainM,
        String geometryGeoJson,
        JsonNode payload,
        Instant savedAt) {
}
