package com.routecraft.api.routes;

import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;

@Repository
class SavedRouteRepository {

    private static final String UPSERT_SQL = """
            INSERT INTO saved_routes (
                id, source, name, activity, route_type, distance_km, estimated_duration_min,
                elevation_gain_m, geometry, payload, saved_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ST_SetSRID(ST_GeomFromGeoJSON(?), 4326), CAST(? AS jsonb), ?)
            ON CONFLICT (id) DO UPDATE SET
                source = EXCLUDED.source,
                name = EXCLUDED.name,
                activity = EXCLUDED.activity,
                route_type = EXCLUDED.route_type,
                distance_km = EXCLUDED.distance_km,
                estimated_duration_min = EXCLUDED.estimated_duration_min,
                elevation_gain_m = EXCLUDED.elevation_gain_m,
                geometry = EXCLUDED.geometry,
                payload = EXCLUDED.payload,
                saved_at = EXCLUDED.saved_at,
                updated_at = now()
            """;

    private final JdbcTemplate jdbcTemplate;
    private final RoutePayloadReader payloadReader;

    SavedRouteRepository(JdbcTemplate jdbcTemplate, RoutePayloadReader payloadReader) {
        this.jdbcTemplate = jdbcTemplate;
        this.payloadReader = payloadReader;
    }

    List<JsonNode> findAll() {
        return jdbcTemplate.query(
                "SELECT payload::text FROM saved_routes ORDER BY saved_at DESC",
                (rs, rowNum) -> payloadReader.readJson(rs.getString(1)));
    }

    Optional<JsonNode> findById(String id) {
        List<JsonNode> routes = jdbcTemplate.query(
                "SELECT payload::text FROM saved_routes WHERE id = ?",
                (rs, rowNum) -> payloadReader.readJson(rs.getString(1)),
                id);
        return routes.stream().findFirst();
    }

    JsonNode upsert(JsonNode payload) {
        RouteSnapshot route = payloadReader.readRoute(payload, true);
        jdbcTemplate.update(
                UPSERT_SQL,
                route.id(),
                route.source(),
                route.name(),
                route.activity(),
                route.routeType(),
                route.distanceKm(),
                route.estimatedDurationMin(),
                route.elevationGainM(),
                route.geometryGeoJson(),
                payloadReader.toJson(route.payload()),
                Timestamp.from(route.savedAt()));
        return route.payload();
    }
}
