package com.routecraft.api.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class SignedOAuthState {

    private final byte[] secret;

    public SignedOAuthState(
            @Value("${routecraft.oauth.state-secret:routecraft-dev-oauth-state-secret-change-me}")
            String secret) {
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
    }

    public String issue(UUID userId, Instant expiresAt) {
        String payload = userId + "|" + expiresAt.getEpochSecond();
        String encodedPayload = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(payload.getBytes(StandardCharsets.UTF_8));
        return encodedPayload + "." + sign(encodedPayload);
    }

    public UUID verify(String state) {
        if (state == null || state.isBlank()) {
            throw new IllegalArgumentException("Invalid OAuth state.");
        }
        String[] parts = state.split("\\.", 2);
        if (parts.length != 2) {
            throw new IllegalArgumentException("Invalid OAuth state.");
        }
        String encodedPayload = parts[0];
        String signature = parts[1];
        if (!MessageDigest.isEqual(
                sign(encodedPayload).getBytes(StandardCharsets.UTF_8),
                signature.getBytes(StandardCharsets.UTF_8))) {
            throw new IllegalArgumentException("Invalid OAuth state.");
        }
        String payload = new String(Base64.getUrlDecoder().decode(encodedPayload), StandardCharsets.UTF_8);
        String[] fields = payload.split("\\|", 2);
        if (fields.length != 2) {
            throw new IllegalArgumentException("Invalid OAuth state.");
        }
        long expiresAt = Long.parseLong(fields[1]);
        if (Instant.now().getEpochSecond() > expiresAt) {
            throw new IllegalArgumentException("OAuth state expired.");
        }
        return UUID.fromString(fields[0]);
    }

    private String sign(String encodedPayload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            byte[] digest = mac.doFinal(encodedPayload.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (Exception error) {
            throw new IllegalStateException("Could not sign OAuth state.", error);
        }
    }
}
