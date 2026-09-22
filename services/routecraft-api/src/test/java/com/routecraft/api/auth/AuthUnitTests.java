package com.routecraft.api.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import org.junit.jupiter.api.Test;

class AuthUnitTests {

    @Test
    void normalizeEmailRejectsBlankAndInvalid() {
        assertThrows(IllegalArgumentException.class, () -> AuthService.normalizeEmail(" "));
        assertThrows(IllegalArgumentException.class, () -> AuthService.normalizeEmail("not-an-email"));
        assertEquals("ada@example.com", AuthService.normalizeEmail(" Ada@Example.com "));
    }

    @Test
    void requirePasswordEnforcesLength() {
        assertThrows(IllegalArgumentException.class, () -> AuthService.requirePassword("short"));
        assertEquals("long-enough", AuthService.requirePassword("long-enough"));
    }

    @Test
    void signedOAuthStateRoundTripsAndRejectsTampering() {
        SignedOAuthState signer = new SignedOAuthState("unit-test-secret");
        UUID userId = UUID.randomUUID();
        String state = signer.issue(userId, Instant.now().plus(5, ChronoUnit.MINUTES));
        assertEquals(userId, signer.verify(state));

        assertThrows(IllegalArgumentException.class, () -> signer.verify(state + "x"));
        assertThrows(IllegalArgumentException.class, () -> signer.verify("not.valid"));

        SignedOAuthState other = new SignedOAuthState("different-secret");
        assertThrows(IllegalArgumentException.class, () -> other.verify(state));
    }

    @Test
    void signedOAuthStateRejectsExpired() {
        SignedOAuthState signer = new SignedOAuthState("unit-test-secret");
        String state = signer.issue(UUID.randomUUID(), Instant.now().minus(1, ChronoUnit.MINUTES));
        assertThrows(IllegalArgumentException.class, () -> signer.verify(state));
    }

    @Test
    void safePathOnlyAllowsRelativeAppPaths() {
        assertEquals("/saved", SafeNextPath.sanitize("/saved"));
        assertEquals("/results?route=1", SafeNextPath.sanitize("/results?route=1"));
        assertEquals("/saved", SafeNextPath.sanitize("https://evil.example"));
        assertEquals("/saved", SafeNextPath.sanitize("//evil.example"));
        assertEquals("/saved", SafeNextPath.sanitize("javascript:alert(1)"));
        assertNotEquals("https://evil.example", SafeNextPath.sanitize("https://evil.example"));
        assertEquals("/saved", SafeNextPath.sanitize("../etc/passwd"));
        assertEquals("/saved", SafeNextPath.sanitize("/../etc/passwd"));
    }
}
