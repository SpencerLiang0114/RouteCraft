package com.routecraft.api.auth;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class StravaTokenRepository {

    private final JdbcTemplate jdbcTemplate;

    public StravaTokenRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<StravaTokens> findByUserId(UUID userId) {
        return jdbcTemplate.query(
                """
                SELECT access_token, refresh_token, expires_at, athlete_id
                FROM user_strava_tokens WHERE user_id = ?
                """,
                (rs, rowNum) -> new StravaTokens(
                        rs.getString("access_token"),
                        rs.getString("refresh_token"),
                        rs.getTimestamp("expires_at").toInstant(),
                        (Long) rs.getObject("athlete_id")),
                userId).stream().findFirst();
    }

    public void upsert(UUID userId, StravaTokens tokens) {
        jdbcTemplate.update(
                """
                INSERT INTO user_strava_tokens (
                    user_id, access_token, refresh_token, expires_at, athlete_id, updated_at
                ) VALUES (?, ?, ?, ?, ?, now())
                ON CONFLICT (user_id) DO UPDATE SET
                    access_token = EXCLUDED.access_token,
                    refresh_token = EXCLUDED.refresh_token,
                    expires_at = EXCLUDED.expires_at,
                    athlete_id = EXCLUDED.athlete_id,
                    updated_at = now()
                """,
                userId,
                tokens.accessToken(),
                tokens.refreshToken(),
                java.sql.Timestamp.from(tokens.expiresAt()),
                tokens.athleteId());
    }

    public void delete(UUID userId) {
        jdbcTemplate.update("DELETE FROM user_strava_tokens WHERE user_id = ?", userId);
    }

    public record StravaTokens(
            String accessToken,
            String refreshToken,
            Instant expiresAt,
            Long athleteId) {}
}
