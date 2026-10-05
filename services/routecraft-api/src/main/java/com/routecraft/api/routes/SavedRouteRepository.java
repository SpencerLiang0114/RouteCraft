package com.routecraft.api.routes;

import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

@Repository
class SavedRouteRepository {

    private static final String INSERT_SQL = """
            INSERT INTO saved_routes (
                id, user_id, source, name, activity, route_type, distance_km, estimated_duration_min,
                elevation_gain_m, geometry, payload, saved_at, notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ST_SetSRID(ST_GeomFromGeoJSON(?), 4326), CAST(? AS jsonb), ?, ?)
            """;

    private final JdbcTemplate jdbcTemplate;
    private final RoutePayloadReader payloadReader;

    SavedRouteRepository(JdbcTemplate jdbcTemplate, RoutePayloadReader payloadReader) {
        this.jdbcTemplate = jdbcTemplate;
        this.payloadReader = payloadReader;
    }

    List<JsonNode> findAllForUser(UUID userId) {
        return jdbcTemplate.query(
                """
                SELECT payload::text, notes
                FROM saved_routes
                WHERE user_id = ?
                ORDER BY saved_at DESC
                """,
                (rs, rowNum) -> withNotes(payloadReader.readJson(rs.getString(1)), rs.getString("notes")),
                userId);
    }

    Optional<JsonNode> findByIdForUser(String id, UUID userId) {
        return jdbcTemplate.query(
                """
                SELECT payload::text, notes
                FROM saved_routes
                WHERE id = ? AND user_id = ?
                """,
                (rs, rowNum) -> withNotes(payloadReader.readJson(rs.getString(1)), rs.getString("notes")),
                id,
                userId).stream().findFirst();
    }

    JsonNode create(UUID userId, JsonNode payload) {
        if (payload == null || !payload.isObject()) {
            throw new IllegalArgumentException("Route payload must be a JSON object.");
        }
        // Client ids (generated-loop-1, uploaded-<slug>, strava-segment-<id>) repeat across
        // generations and users, so each save gets its own id instead of upserting on them.
        ObjectNode withId = (ObjectNode) payload.deepCopy();
        withId.put("id", newId());
        RouteSnapshot route = payloadReader.readRoute(withId, true);
        ObjectNode enriched = (ObjectNode) route.payload().deepCopy();
        String notes = readNotes(enriched);

        jdbcTemplate.update(
                INSERT_SQL,
                route.id(),
                userId,
                route.source(),
                route.name(),
                route.activity(),
                route.routeType(),
                route.distanceKm(),
                route.estimatedDurationMin(),
                route.elevationGainM(),
                route.geometryGeoJson(),
                payloadReader.toJson(enriched),
                Timestamp.from(route.savedAt()),
                notes);
        return withNotes(enriched, notes);
    }

    static String newId() {
        return "saved-" + UUID.randomUUID();
    }

    Optional<JsonNode> rename(UUID userId, String id, String name, String notes) {
        Optional<JsonNode> existing = findByIdForUser(id, userId);
        if (existing.isEmpty()) {
            return Optional.empty();
        }
        ObjectNode merged = (ObjectNode) existing.get().deepCopy();
        String trimmedName = name == null ? null : name.trim();
        if (trimmedName == null || trimmedName.isBlank()) {
            throw new IllegalArgumentException("name is required.");
        }
        merged.put("name", trimmedName);
        if (notes == null) {
            merged.putNull("notes");
        } else {
            merged.put("notes", notes);
        }

        jdbcTemplate.update(
                """
                UPDATE saved_routes
                SET name = ?, notes = ?, payload = CAST(? AS jsonb), updated_at = now()
                WHERE id = ? AND user_id = ?
                """,
                trimmedName,
                notes,
                payloadReader.toJson(merged),
                id,
                userId);
        return Optional.of(merged);
    }

    boolean delete(UUID userId, String id) {
        return jdbcTemplate.update(
                "DELETE FROM saved_routes WHERE id = ? AND user_id = ?",
                id,
                userId) > 0;
    }

    private JsonNode withNotes(JsonNode payload, String notes) {
        ObjectNode node = payload instanceof ObjectNode objectNode
                ? objectNode.deepCopy()
                : (ObjectNode) payloadReader.readJson("{}");
        if (notes == null) {
            node.putNull("notes");
        } else {
            node.put("notes", notes);
        }
        return node;
    }

    private String readNotes(JsonNode payload) {
        JsonNode notes = payload.get("notes");
        if (notes == null || notes.isNull()) {
            return null;
        }
        if (!notes.isString()) {
            throw new IllegalArgumentException("notes must be a string.");
        }
        String value = notes.asString();
        return value.isBlank() ? null : value;
    }
}
