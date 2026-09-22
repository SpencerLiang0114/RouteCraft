package com.routecraft.api.auth;

/**
 * Restricts post-login redirects to same-origin relative paths.
 */
public final class SafeNextPath {

    private SafeNextPath() {}

    public static String sanitize(String next) {
        return sanitize(next, "/saved");
    }

    public static String sanitize(String next, String fallback) {
        if (next == null || next.isBlank()) {
            return fallback;
        }
        String value = next.trim();
        if (!value.startsWith("/") || value.startsWith("//") || value.contains("://")) {
            return fallback;
        }
        if (value.contains("\\") || value.contains("..")
                || value.indexOf('\n') >= 0 || value.indexOf('\r') >= 0) {
            return fallback;
        }
        return value;
    }
}
