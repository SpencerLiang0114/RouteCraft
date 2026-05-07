package com.routecraft.api.osm;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Repository
public class OsmGraphCacheRepository {

    private static final String SELECT_FRESH_SQL = """
            SELECT bbox_key, elements::text, expires_at
            FROM osm_graph_cache
            WHERE bbox_key = ? AND expires_at > now()
            """;

    private static final String UPSERT_SQL = """
            INSERT INTO osm_graph_cache (bbox_key, bbox, elements, expires_at)
            VALUES (?, ST_MakeEnvelope(?, ?, ?, ?, 4326), CAST(? AS jsonb), ?)
            ON CONFLICT (bbox_key) DO UPDATE SET
                bbox = EXCLUDED.bbox,
                elements = EXCLUDED.elements,
                expires_at = EXCLUDED.expires_at,
                updated_at = now()
            """;

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    OsmGraphCacheRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public Optional<OsmGraphCacheEntry> findFresh(String bbox) {
        List<OsmGraphCacheEntry> entries = jdbcTemplate.query(
                SELECT_FRESH_SQL,
                (rs, rowNum) -> new OsmGraphCacheEntry(
                        rs.getString("bbox_key"),
                        readJson(rs.getString("elements")),
                        rs.getTimestamp("expires_at").toInstant()),
                bbox);
        return entries.stream().findFirst();
    }

    public OsmGraphCacheEntry put(String bbox, JsonNode elements, int ttlSeconds) {
        if (elements == null || !elements.isArray()) {
            throw new IllegalArgumentException("OSM cache elements must be an array.");
        }

        BBox parsed = BBox.parse(bbox);
        Instant expiresAt = Instant.now().plusSeconds(ttlSeconds);
        jdbcTemplate.update(
                UPSERT_SQL,
                bbox,
                parsed.west(),
                parsed.south(),
                parsed.east(),
                parsed.north(),
                toJson(elements),
                Timestamp.from(expiresAt));
        return new OsmGraphCacheEntry(bbox, elements, expiresAt);
    }

    private String toJson(JsonNode payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JacksonException error) {
            throw new IllegalArgumentException("Could not serialize JSON payload.");
        }
    }

    private JsonNode readJson(String payload) {
        try {
            return objectMapper.readTree(payload);
        } catch (JacksonException error) {
            throw new IllegalArgumentException("Could not parse stored JSON payload.");
        }
    }

    public record OsmGraphCacheEntry(String bbox, JsonNode elements, Instant expiresAt) {
    }

    private record BBox(double south, double west, double north, double east) {
        static BBox parse(String bbox) {
            String[] parts = bbox.split(",");
            if (parts.length != 4) {
                throw new IllegalArgumentException("bbox must be south,west,north,east.");
            }

            try {
                double south = Double.parseDouble(parts[0]);
                double west = Double.parseDouble(parts[1]);
                double north = Double.parseDouble(parts[2]);
                double east = Double.parseDouble(parts[3]);
                if (!Double.isFinite(south) || !Double.isFinite(west) ||
                        !Double.isFinite(north) || !Double.isFinite(east) ||
                        south < -90 || north > 90 || west < -180 || east > 180 ||
                        south >= north || west >= east) {
                    throw new IllegalArgumentException("bbox coordinates are out of range.");
                }
                return new BBox(south, west, north, east);
            } catch (NumberFormatException error) {
                throw new IllegalArgumentException("bbox must contain numeric coordinates.");
            }
        }
    }
}
