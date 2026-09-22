package com.routecraft.api.auth;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.routecraft.api.auth.StravaTokenRepository.StravaTokens;

@Service
public class StravaOAuthService {

    private final StravaTokenRepository tokens;
    private final SignedOAuthState signedState;
    private final RestClient restClient = RestClient.builder().build();
    private final String clientId;
    private final String clientSecret;
    private final String redirectUri;
    private final String frontendBaseUrl;

    public StravaOAuthService(
            StravaTokenRepository tokens,
            SignedOAuthState signedState,
            @Value("${strava.client.id:}") String clientId,
            @Value("${strava.client.secret:}") String clientSecret,
            @Value("${strava.oauth.redirect-uri:http://localhost:18080/api/auth/strava/callback}") String redirectUri,
            @Value("${routecraft.frontend.base-url:http://localhost:3000}") String frontendBaseUrl) {
        this.tokens = tokens;
        this.signedState = signedState;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
        this.frontendBaseUrl = frontendBaseUrl.replaceAll("/$", "");
    }

    public boolean isConfigured() {
        return clientId != null && !clientId.isBlank()
                && clientSecret != null && !clientSecret.isBlank();
    }

    public String buildAuthorizeUrl(UUID userId) {
        if (!isConfigured()) {
            throw new IllegalArgumentException("Strava OAuth is not configured.");
        }
        String state = signedState.issue(userId, Instant.now().plus(10, ChronoUnit.MINUTES));
        return "https://www.strava.com/oauth/authorize"
                + "?client_id=" + enc(clientId)
                + "&response_type=code"
                + "&redirect_uri=" + enc(redirectUri)
                + "&approval_prompt=auto"
                + "&scope=" + enc("read,activity:read")
                + "&state=" + enc(state);
    }

    public String handleCallback(String code, String state) {
        if (!isConfigured()) {
            return frontendBaseUrl + "/strava?strava=not_configured";
        }
        try {
            UUID userId = signedState.verify(state);
            if (code == null || code.isBlank()) {
                return frontendBaseUrl + "/strava?strava=error";
            }
            MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
            body.add("client_id", clientId);
            body.add("client_secret", clientSecret);
            body.add("code", code);
            body.add("grant_type", "authorization_code");

            TokenExchangeResponse tokenResponse = restClient.post()
                    .uri("https://www.strava.com/oauth/token")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(body)
                    .retrieve()
                    .body(TokenExchangeResponse.class);
            if (tokenResponse == null || tokenResponse.accessToken() == null) {
                return frontendBaseUrl + "/strava?strava=error";
            }
            Long athleteId = tokenResponse.athlete() == null ? null : tokenResponse.athlete().id();
            tokens.upsert(userId, new StravaTokens(
                    tokenResponse.accessToken(),
                    tokenResponse.refreshToken(),
                    Instant.ofEpochSecond(tokenResponse.expiresAt()),
                    athleteId));
            return frontendBaseUrl + "/strava?strava=connected";
        } catch (Exception error) {
            return frontendBaseUrl + "/strava?strava=error";
        }
    }

    public Map<String, Object> status(UUID userId) {
        return Map.of(
                "connected", tokens.findByUserId(userId).isPresent(),
                "oauthConfigured", isConfigured());
    }

    public void disconnect(UUID userId) {
        tokens.delete(userId);
    }

    private static String enc(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private record TokenExchangeResponse(
            @JsonProperty("access_token") String accessToken,
            @JsonProperty("refresh_token") String refreshToken,
            @JsonProperty("expires_at") long expiresAt,
            Athlete athlete) {}

    private record Athlete(long id) {}
}
