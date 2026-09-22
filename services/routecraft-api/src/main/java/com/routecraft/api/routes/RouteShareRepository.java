package com.routecraft.api.routes;

import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

@Repository
class RouteShareRepository {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int DEFAULT_EXPIRY_HOURS = 168; // 7 days
    private static final int MAX_EXPIRY_HOURS = 24 * 90;

    private final JdbcTemplate jdbcTemplate;
    private final RoutePayloadReader payloadReader;

    RouteShareRepository(JdbcTemplate jdbcTemplate, RoutePayloadReader payloadReader) {
        this.jdbcTemplate = jdbcTemplate;
        this.payloadReader = payloadReader;
    }

    Map<String, Object> create(UUID userId, String routeId, Integer expiresInHours) {
        int hours = expiresInHours == null ? DEFAULT_EXPIRY_HOURS : expiresInHours;
        if (hours < 1 || hours > MAX_EXPIRY_HOURS) {
            throw new IllegalArgumentException("expiresInHours must be between 1 and " + MAX_EXPIRY_HOURS + ".");
        }
        Instant expiresAt = Instant.now().plus(hours, ChronoUnit.HOURS);
        String token = generateToken();
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                """
                INSERT INTO route_shares (id, token, route_id, user_id, expires_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                id, token, routeId, userId, Timestamp.from(expiresAt));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("token", token);
        body.put("urlPath", "/share/" + token);
        body.put("expiresAt", expiresAt.toString());
        body.put("routeId", routeId);
        return body;
    }

    boolean revoke(UUID userId, String token) {
        return jdbcTemplate.update(
                "DELETE FROM route_shares WHERE token = ? AND user_id = ?",
                token,
                userId) > 0;
    }

    Optional<Map<String, Object>> findPublicByToken(String token) {
        return jdbcTemplate.query(
                """
                SELECT s.token, s.expires_at, s.route_id, r.payload::text, r.notes, r.name
                FROM route_shares s
                JOIN saved_routes r ON r.id = s.route_id
                WHERE s.token = ?
                """,
                (rs, rowNum) -> {
                    Instant expiresAt = rs.getTimestamp("expires_at").toInstant();
                    if (expiresAt.isBefore(Instant.now())) {
                        return null;
                    }
                    ObjectNode route = (ObjectNode) payloadReader.readJson(rs.getString("payload")).deepCopy();
                    if (rs.getString("notes") != null) {
                        route.put("notes", rs.getString("notes"));
                    }
                    Map<String, Object> body = new LinkedHashMap<>();
                    body.put("token", rs.getString("token"));
                    body.put("routeId", rs.getString("route_id"));
                    body.put("name", rs.getString("name"));
                    body.put("expiresAt", expiresAt.toString());
                    body.put("route", route);
                    return body;
                },
                token).stream().filter(row -> row != null).findFirst();
    }

    private static String generateToken() {
        byte[] bytes = new byte[24];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
