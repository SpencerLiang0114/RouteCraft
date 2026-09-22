package com.routecraft.api.routes;

import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

@Repository
class RouteShareRepository {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final JdbcTemplate jdbcTemplate;
    private final RoutePayloadReader payloadReader;

    RouteShareRepository(JdbcTemplate jdbcTemplate, RoutePayloadReader payloadReader) {
        this.jdbcTemplate = jdbcTemplate;
        this.payloadReader = payloadReader;
    }

    ShareRecord create(UUID userId, String routeId, Integer expiresInHours) {
        Instant expiresAt = null;
        if (expiresInHours != null) {
            if (expiresInHours < 1 || expiresInHours > 24 * 365) {
                throw new IllegalArgumentException("expiresInHours must be between 1 and 8760.");
            }
            expiresAt = Instant.now().plus(expiresInHours, ChronoUnit.HOURS);
        }

        UUID id = UUID.randomUUID();
        String token = generateToken();
        jdbcTemplate.update(
                """
                INSERT INTO route_shares (id, token, route_id, user_id, expires_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                id,
                token,
                routeId,
                userId,
                expiresAt == null ? null : Timestamp.from(expiresAt));
        return new ShareRecord(id, token, routeId, userId, expiresAt);
    }

    Optional<PublicShare> findPublicByToken(String token) {
        List<PublicShare> shares = jdbcTemplate.query(
                """
                SELECT s.token, s.expires_at, s.route_id, r.payload::text, r.notes, r.visibility, r.name
                FROM route_shares s
                JOIN saved_routes r ON r.id = s.route_id
                WHERE s.token = ?
                """,
                (rs, rowNum) -> {
                    Timestamp expires = rs.getTimestamp("expires_at");
                    Instant expiresAt = expires == null ? null : expires.toInstant();
                    if (expiresAt != null && expiresAt.isBefore(Instant.now())) {
                        return null;
                    }
                    String visibility = rs.getString("visibility");
                    // Share links work for private routes that were explicitly shared.
                    ObjectNode payload = (ObjectNode) payloadReader.readJson(rs.getString("payload")).deepCopy();
                    if (rs.getString("notes") != null) {
                        payload.put("notes", rs.getString("notes"));
                    }
                    payload.put("visibility", visibility);
                    return new PublicShare(
                            rs.getString("token"),
                            rs.getString("route_id"),
                            rs.getString("name"),
                            expiresAt,
                            payload);
                },
                token);

        return shares.stream().filter(share -> share != null).findFirst();
    }

    private static String generateToken() {
        byte[] bytes = new byte[24];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    record ShareRecord(UUID id, String token, String routeId, UUID userId, Instant expiresAt) {}

    record PublicShare(String token, String routeId, String name, Instant expiresAt, JsonNode route) {}
}
