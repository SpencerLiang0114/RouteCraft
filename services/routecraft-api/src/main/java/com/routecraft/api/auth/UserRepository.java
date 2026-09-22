package com.routecraft.api.auth;

import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepository {

    private final JdbcTemplate jdbcTemplate;

    public UserRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<AppUser> findByEmail(String email) {
        return jdbcTemplate.query(
                """
                SELECT id, email, password_hash, display_name
                FROM users
                WHERE lower(email) = lower(?)
                """,
                (rs, rowNum) -> new AppUser(
                        (UUID) rs.getObject("id"),
                        rs.getString("email"),
                        rs.getString("password_hash"),
                        rs.getString("display_name")),
                email).stream().findFirst();
    }

    public Optional<AppUser> findById(UUID id) {
        return jdbcTemplate.query(
                """
                SELECT id, email, password_hash, display_name
                FROM users
                WHERE id = ?
                """,
                (rs, rowNum) -> new AppUser(
                        (UUID) rs.getObject("id"),
                        rs.getString("email"),
                        rs.getString("password_hash"),
                        rs.getString("display_name")),
                id).stream().findFirst();
    }

    public AppUser insert(UUID id, String email, String passwordHash, String displayName) {
        jdbcTemplate.update(
                """
                INSERT INTO users (id, email, password_hash, display_name)
                VALUES (?, ?, ?, ?)
                """,
                id, email, passwordHash, displayName);
        return new AppUser(id, email, passwordHash, displayName);
    }
}
