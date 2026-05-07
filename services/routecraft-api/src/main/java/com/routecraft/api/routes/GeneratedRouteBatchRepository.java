package com.routecraft.api.routes;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import com.routecraft.api.routing.model.LatLng;
import com.routecraft.api.routing.model.RouteCandidate;
import com.routecraft.api.routing.model.UserPreferences;

@Repository
public class GeneratedRouteBatchRepository {

    private static final String INSERT_BATCH_SQL = """
            INSERT INTO generated_route_batches (id, preferences, route_count, bbox)
            VALUES (?, CAST(? AS jsonb), ?,
                    CASE WHEN ?::double precision IS NULL THEN NULL
                         ELSE ST_MakeEnvelope(?, ?, ?, ?, 4326) END)
            """;

    private static final String INSERT_ROUTE_SQL = """
            INSERT INTO generated_route_candidates (
                batch_id, route_id, source, name, activity, route_type, distance_km,
                estimated_duration_min, elevation_gain_m, geometry, payload
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ST_SetSRID(ST_GeomFromGeoJSON(?), 4326), CAST(? AS jsonb))
            """;

    private final JdbcTemplate jdbcTemplate;
    private final RoutePayloadReader payloadReader;
    private final ObjectMapper objectMapper;

    GeneratedRouteBatchRepository(JdbcTemplate jdbcTemplate, RoutePayloadReader payloadReader, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.payloadReader = payloadReader;
        this.objectMapper = objectMapper;
    }

    @Transactional
    UUID saveBatch(JsonNode preferences, List<JsonNode> routes) {
        UUID batchId = UUID.randomUUID();
        BoundingBox bbox = BoundingBox.fromJsonRoutes(routes);
        insertBatch(batchId, preferences, routes.size(), bbox);

        for (JsonNode routePayload : routes) {
            RouteSnapshot route = payloadReader.readRoute(routePayload, false);
            insertCandidate(batchId, route);
        }

        return batchId;
    }

    @Transactional
    public UUID saveTypedBatch(UserPreferences preferences, List<RouteCandidate> routes) {
        UUID batchId = UUID.randomUUID();
        BoundingBox bbox = BoundingBox.fromTypedRoutes(routes);
        insertBatch(batchId, objectMapper.valueToTree(preferences), routes.size(), bbox);

        for (RouteCandidate route : routes) {
            JsonNode payload = objectMapper.valueToTree(route);
            jdbcTemplate.update(
                    INSERT_ROUTE_SQL,
                    batchId,
                    route.id(),
                    route.source().value(),
                    route.name(),
                    route.activity().value(),
                    route.routeType() == null ? null : route.routeType().value(),
                    route.distanceKm(),
                    route.estimatedDurationMin(),
                    route.elevationGainM(),
                    geometryToGeoJson(route.geometry()),
                    payloadReader.toJson(payload));
        }

        return batchId;
    }

    private void insertBatch(UUID batchId, JsonNode preferences, int routeCount, BoundingBox bbox) {
        if (bbox == null) {
            jdbcTemplate.update(
                    INSERT_BATCH_SQL,
                    batchId, payloadReader.toJson(preferences), routeCount,
                    null, null, null, null, null);
        } else {
            jdbcTemplate.update(
                    INSERT_BATCH_SQL,
                    batchId, payloadReader.toJson(preferences), routeCount,
                    bbox.west(),
                    bbox.west(), bbox.south(), bbox.east(), bbox.north());
        }
    }

    private void insertCandidate(UUID batchId, RouteSnapshot route) {
        jdbcTemplate.update(
                INSERT_ROUTE_SQL,
                batchId,
                route.id(),
                route.source(),
                route.name(),
                route.activity(),
                route.routeType(),
                route.distanceKm(),
                route.estimatedDurationMin(),
                route.elevationGainM(),
                route.geometryGeoJson(),
                payloadReader.toJson(route.payload()));
    }

    private String geometryToGeoJson(List<LatLng> geometry) {
        if (geometry == null || geometry.size() < 2) {
            throw new IllegalArgumentException("Route geometry must contain at least two points.");
        }
        ObjectNode lineString = objectMapper.createObjectNode();
        ArrayNode coordinates = objectMapper.createArrayNode();
        for (LatLng point : geometry) {
            ArrayNode coord = objectMapper.createArrayNode();
            coord.add(point.lng());
            coord.add(point.lat());
            coordinates.add(coord);
        }
        lineString.put("type", "LineString");
        lineString.set("coordinates", coordinates);
        try {
            return objectMapper.writeValueAsString(lineString);
        } catch (Exception ex) {
            throw new IllegalStateException("Could not serialize route geometry to GeoJSON.", ex);
        }
    }

    @SuppressWarnings("unused")
    private static String formatCoordinate(double value) {
        return String.format(Locale.ROOT, "%.7f", value);
    }
}
