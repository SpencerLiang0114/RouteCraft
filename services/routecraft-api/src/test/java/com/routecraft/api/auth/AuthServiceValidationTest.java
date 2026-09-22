package com.routecraft.api.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class AuthServiceValidationTest {

    @Test
    void passwordEncoderRoundTrips() {
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        String hash = encoder.encode("test-password-123");
        assertTrue(encoder.matches("test-password-123", hash));
    }

    @Test
    void appUserExposesEmailAsUsername() {
        AppUser user = new AppUser(UUID.randomUUID(), "a@example.com", "hash", "Ada");
        assertEquals("a@example.com", user.getUsername());
        assertEquals("Ada", user.displayName());
        assertEquals(1, user.getAuthorities().size());
    }
}
