package com.routecraft.api.auth;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
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

    private final StravaTokenRepository tokenRepository;
    private final RestClient restClient;
    private final String clientId;
    private final String clientSecret;
    private final String redirectUri;
    private final String frontendBaseUrl;

    public StravaOAuthService(
            StravaTokenRepository tokenRepository,
            @Value("${strava.client.id:}") String clientId,
            @Value("${strava.client.secret:}") String clientSecret,
            @Value("${strava.oauth.redirect-uri:http://localhost:18080/api/auth/strava/callback}") String redirectUri,
            @Value("${routecraft.frontend.base-url:http://localhost:3000}") String frontendBaseUrl) {
        this.tokenRepository = tokenRepository;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
        this.frontendBaseUrl = frontendBaseUrl.replaceAll("/$", "");
        this.restClient = RestClient.builder().build();
    }

    public boolean isOAuthConfigured() {
        return clientId != null && !clientId.isBlank()
                && clientSecret != null && !clientSecret.isBlank();
    }

    public String buildAuthorizeUrl(UUID userId) {
        if (!isOAuthConfigured()) {
            throw new IllegalArgumentException("Strava OAuth is not configured.");
        }
        String state = userId.toString();
        return "https://www.strava.com/oauth/authorize"
                + "?client_id=" + urlEncode(clientId)
                + "&response_type=code"
                + "&redirect_uri=" + urlEncode(redirectUri)
                + "&approval_prompt=auto"
                + "&scope=" + urlEncode("read,activity:read")
                + "&state=" + urlEncode(state);
    }

    public String handleCallback(String code, String state) {
        if (!isOAuthConfigured()) {
            return frontendBaseUrl + "/strava?strava=not_configured";
        }
        if (code == null || code.isBlank() || state == null || state.isBlank()) {
            return frontendBaseUrl + "/strava?strava=error";
        }

        UUID userId;
        try {
            userId = UUID.fromString(state);
        } catch (IllegalArgumentException error) {
            return frontendBaseUrl + "/strava?strava=error";
        }

        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("client_id", clientId);
        body.add("client_secret", clientSecret);
        body.add("code", code);
        body.add("grant_type", "authorization_code");

        try {
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
            tokenRepository.upsert(
                    userId,
                    new StravaTokens(
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
        boolean connected = tokenRepository.findByUserId(userId).isPresent();
        return Map.of(
                "connected", connected,
                "oauthConfigured", isOAuthConfigured());
    }

    public void disconnect(UUID userId) {
        tokenRepository.delete(userId);
    }

    private static String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private record TokenExchangeResponse(
            @JsonProperty("access_token") String accessToken,
            @JsonProperty("refresh_token") String refreshToken,
            @JsonProperty("expires_at") long expiresAt,
            Athlete athlete) {}

    private record Athlete(long id) {}
}
