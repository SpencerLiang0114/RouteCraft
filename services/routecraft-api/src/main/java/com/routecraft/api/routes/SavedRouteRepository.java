package com.routecraft.api.routes;

import java.math.BigDecimal;
import java.sql.Array;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import com.routecraft.api.auth.ForbiddenException;

@Repository
class SavedRouteRepository {

    private static final int MAX_ROUTE_POINTS = 50_000;

    private static final String UPSERT_SQL = """
            INSERT INTO saved_routes (
                id, user_id, source, name, activity, route_type, distance_km, estimated_duration_min,
                elevation_gain_m, geometry, payload, saved_at, notes, tags, folder, visibility
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ST_SetSRID(ST_GeomFromGeoJSON(?), 4326), CAST(? AS jsonb), ?, ?, CAST(? AS text[]), ?, ?)
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
                notes = EXCLUDED.notes,
                tags = EXCLUDED.tags,
                folder = EXCLUDED.folder,
                visibility = EXCLUDED.visibility,
                updated_at = now()
            WHERE saved_routes.user_id = EXCLUDED.user_id
            """;

    private final JdbcTemplate jdbcTemplate;
    private final RoutePayloadReader payloadReader;

    SavedRouteRepository(JdbcTemplate jdbcTemplate, RoutePayloadReader payloadReader) {
        this.jdbcTemplate = jdbcTemplate;
        this.payloadReader = payloadReader;
    }

    List<JsonNode> search(UUID userId, SavedRouteQuery query) {
        StringBuilder sql = new StringBuilder("""
                SELECT payload::text, notes, tags, folder, visibility
                FROM saved_routes
                WHERE user_id = ?
                """);
        List<Object> args = new ArrayList<>();
        args.add(userId);

        if (query.q() != null && !query.q().isBlank()) {
            sql.append(" AND (name ILIKE ? OR coalesce(notes, '') ILIKE ?)");
            String like = "%" + query.q().trim() + "%";
            args.add(like);
            args.add(like);
        }
        if (query.activity() != null && !query.activity().isBlank()) {
            sql.append(" AND activity = ?");
            args.add(query.activity().trim());
        }
        if (query.folder() != null && !query.folder().isBlank()) {
            sql.append(" AND folder = ?");
            args.add(query.folder().trim());
        }
        if (query.tag() != null && !query.tag().isBlank()) {
            sql.append(" AND ? = ANY(tags)");
            args.add(query.tag().trim());
        }
        if (query.minDistanceKm() != null) {
            sql.append(" AND distance_km >= ?");
            args.add(query.minDistanceKm());
        }
        if (query.maxDistanceKm() != null) {
            sql.append(" AND distance_km <= ?");
            args.add(query.maxDistanceKm());
        }
        if (query.minElevationM() != null) {
            sql.append(" AND elevation_gain_m >= ?");
            args.add(query.minElevationM());
        }
        if (query.maxElevationM() != null) {
            sql.append(" AND elevation_gain_m <= ?");
            args.add(query.maxElevationM());
        }
        if (query.savedAfter() != null) {
            sql.append(" AND saved_at >= ?");
            args.add(Timestamp.from(query.savedAfter()));
        }
        if (query.savedBefore() != null) {
            sql.append(" AND saved_at <= ?");
            args.add(Timestamp.from(query.savedBefore()));
        }

        sql.append(" ORDER BY ").append(sortClause(query.sort()));

        return jdbcTemplate.query(
                sql.toString(),
                (rs, rowNum) -> enrichPayload(
                        payloadReader.readJson(rs.getString(1)),
                        rs.getString("notes"),
                        toTagList(rs.getArray("tags")),
                        rs.getString("folder"),
                        rs.getString("visibility")),
                args.toArray());
    }

    Optional<JsonNode> findByIdForUser(String id, UUID userId) {
        List<JsonNode> routes = jdbcTemplate.query(
                """
                SELECT payload::text, notes, tags, folder, visibility
                FROM saved_routes
                WHERE id = ? AND user_id = ?
                """,
                (rs, rowNum) -> enrichPayload(
                        payloadReader.readJson(rs.getString(1)),
                        rs.getString("notes"),
                        toTagList(rs.getArray("tags")),
                        rs.getString("folder"),
                        rs.getString("visibility")),
                id,
                userId);
        return routes.stream().findFirst();
    }

    Optional<OwnedRoute> findOwned(String id) {
        List<OwnedRoute> routes = jdbcTemplate.query(
                """
                SELECT id, user_id, payload::text, notes, tags, folder, visibility
                FROM saved_routes
                WHERE id = ?
                """,
                (rs, rowNum) -> new OwnedRoute(
                        rs.getString("id"),
                        (UUID) rs.getObject("user_id"),
                        enrichPayload(
                                payloadReader.readJson(rs.getString("payload")),
                                rs.getString("notes"),
                                toTagList(rs.getArray("tags")),
                                rs.getString("folder"),
                                rs.getString("visibility"))),
                id);
        return routes.stream().findFirst();
    }

    JsonNode upsert(UUID userId, JsonNode payload) {
        RouteSnapshot route = payloadReader.readRoute(payload, true);
        assertPointLimit(route.payload());

        ObjectNode enriched = (ObjectNode) route.payload().deepCopy();
        String notes = optionalText(enriched, "notes");
        List<String> tags = readTags(enriched);
        String folder = optionalText(enriched, "folder");
        String visibility = normalizeVisibility(optionalText(enriched, "visibility"));
        applyLibraryFields(enriched, notes, tags, folder, visibility);

        Optional<OwnedRoute> existing = findOwned(route.id());
        if (existing.isPresent()) {
            if (existing.get().userId() == null || !existing.get().userId().equals(userId)) {
                throw new ForbiddenException("You do not own this saved route.");
            }
        }

        int updated = jdbcTemplate.update(
                UPSERT_SQL,
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
                notes,
                toPgTextArray(tags),
                folder,
                visibility);

        if (updated == 0) {
            throw new ForbiddenException("You do not own this saved route.");
        }
        return enriched;
    }

    Optional<JsonNode> patch(UUID userId, String id, JsonNode patch) {
        Optional<JsonNode> existing = findByIdForUser(id, userId);
        if (existing.isEmpty()) {
            return Optional.empty();
        }

        ObjectNode merged = (ObjectNode) existing.get().deepCopy();
        if (patch.has("name") && patch.get("name").isString()) {
            String name = patch.get("name").asString().trim();
            if (name.isBlank()) {
                throw new IllegalArgumentException("name is required.");
            }
            merged.put("name", name);
        }
        if (patch.has("notes")) {
            if (patch.get("notes").isNull()) {
                merged.putNull("notes");
            } else if (patch.get("notes").isString()) {
                merged.put("notes", patch.get("notes").asString());
            } else {
                throw new IllegalArgumentException("notes must be a string.");
            }
        }
        if (patch.has("tags")) {
            merged.set("tags", patch.get("tags"));
        }
        if (patch.has("folder")) {
            if (patch.get("folder").isNull()) {
                merged.putNull("folder");
            } else if (patch.get("folder").isString()) {
                merged.put("folder", patch.get("folder").asString());
            } else {
                throw new IllegalArgumentException("folder must be a string.");
            }
        }
        if (patch.has("visibility") && patch.get("visibility").isString()) {
            merged.put("visibility", normalizeVisibility(patch.get("visibility").asString()));
        }

        String notes = optionalText(merged, "notes");
        List<String> tags = readTags(merged);
        String folder = optionalText(merged, "folder");
        String visibility = normalizeVisibility(optionalText(merged, "visibility"));
        applyLibraryFields(merged, notes, tags, folder, visibility);

        jdbcTemplate.update(
                """
                UPDATE saved_routes
                SET name = ?,
                    notes = ?,
                    tags = CAST(? AS text[]),
                    folder = ?,
                    visibility = ?,
                    payload = CAST(? AS jsonb),
                    updated_at = now()
                WHERE id = ? AND user_id = ?
                """,
                merged.get("name").asString(),
                notes,
                toPgTextArray(tags),
                folder,
                visibility,
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

    JsonNode duplicate(UUID userId, String id) {
        JsonNode original = findByIdForUser(id, userId)
                .orElseThrow(() -> new IllegalArgumentException("Saved route not found."));
        ObjectNode copy = (ObjectNode) original.deepCopy();
        String newId = id + "-copy-" + UUID.randomUUID().toString().substring(0, 8);
        copy.put("id", newId);
        copy.put("name", copy.path("name").asString("Route") + " (copy)");
        copy.put("savedAt", Instant.now().toString());
        copy.put("visibility", "private");
        return upsert(userId, copy);
    }

    private void assertPointLimit(JsonNode payload) {
        JsonNode geometry = payload.get("geometry");
        if (geometry != null && geometry.isArray() && geometry.size() > MAX_ROUTE_POINTS) {
            throw new IllegalArgumentException("Route exceeds the maximum of " + MAX_ROUTE_POINTS + " points.");
        }
    }

    private JsonNode enrichPayload(
            JsonNode payload,
            String notes,
            List<String> tags,
            String folder,
            String visibility) {
        ObjectNode node;
        if (payload instanceof ObjectNode objectNode) {
            node = objectNode.deepCopy();
        } else {
            node = (ObjectNode) payloadReader.readJson("{}");
        }
        applyLibraryFields(node, notes, tags, folder, visibility);
        return node;
    }

    private void applyLibraryFields(
            ObjectNode node,
            String notes,
            List<String> tags,
            String folder,
            String visibility) {
        if (notes == null) {
            node.putNull("notes");
        } else {
            node.put("notes", notes);
        }
        ArrayNode tagNode = node.putArray("tags");
        for (String tag : tags) {
            tagNode.add(tag);
        }
        if (folder == null || folder.isBlank()) {
            node.putNull("folder");
        } else {
            node.put("folder", folder);
        }
        node.put("visibility", visibility == null ? "private" : visibility);
    }

    private List<String> readTags(JsonNode payload) {
        JsonNode tags = payload.get("tags");
        if (tags == null || tags.isNull()) {
            return List.of();
        }
        if (!tags.isArray()) {
            throw new IllegalArgumentException("tags must be an array of strings.");
        }
        List<String> values = new ArrayList<>();
        for (JsonNode tag : tags) {
            if (!tag.isString()) {
                throw new IllegalArgumentException("tags must be an array of strings.");
            }
            String cleaned = tag.asString().trim();
            if (!cleaned.isBlank() && cleaned.length() <= 40 && !values.contains(cleaned)) {
                values.add(cleaned);
            }
        }
        if (values.size() > 20) {
            throw new IllegalArgumentException("A route can have at most 20 tags.");
        }
        return values;
    }

    private String optionalText(JsonNode payload, String field) {
        JsonNode value = payload.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        if (!value.isString()) {
            return null;
        }
        String text = value.asString();
        return text.isBlank() ? null : text;
    }

    private String normalizeVisibility(String visibility) {
        if (visibility == null || visibility.isBlank()) {
            return "private";
        }
        String normalized = visibility.trim().toLowerCase();
        if (!normalized.equals("private") && !normalized.equals("public")) {
            throw new IllegalArgumentException("visibility must be private or public.");
        }
        return normalized;
    }

    private List<String> toTagList(Array array) {
        if (array == null) {
            return List.of();
        }
        try {
            Object raw = array.getArray();
            if (raw instanceof String[] strings) {
                return Arrays.asList(strings);
            }
            return List.of();
        } catch (Exception error) {
            throw new IllegalStateException("Could not read tags array.", error);
        }
    }

    private static String toPgTextArray(List<String> tags) {
        StringBuilder builder = new StringBuilder("{");
        for (int i = 0; i < tags.size(); i++) {
            if (i > 0) {
                builder.append(',');
            }
            builder.append('"')
                    .append(tags.get(i).replace("\\", "\\\\").replace("\"", "\\\""))
                    .append('"');
        }
        builder.append('}');
        return builder.toString();
    }

    private static String sortClause(String sort) {
        if (sort == null || sort.isBlank() || "newest".equalsIgnoreCase(sort)) {
            return "saved_at DESC";
        }
        if ("distance".equalsIgnoreCase(sort)) {
            return "distance_km DESC, saved_at DESC";
        }
        if ("elevation".equalsIgnoreCase(sort)) {
            return "elevation_gain_m DESC, saved_at DESC";
        }
        throw new IllegalArgumentException("sort must be newest, distance, or elevation.");
    }

    record SavedRouteQuery(
            String q,
            String activity,
            String folder,
            String tag,
            BigDecimal minDistanceKm,
            BigDecimal maxDistanceKm,
            BigDecimal minElevationM,
            BigDecimal maxElevationM,
            Instant savedAfter,
            Instant savedBefore,
            String sort) {}

    record OwnedRoute(String id, UUID userId, JsonNode payload) {}
}
