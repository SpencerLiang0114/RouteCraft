package com.routecraft.api.routing.osm;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.routecraft.api.routing.graph.GeoUtils;
import com.routecraft.api.routing.model.LatLng;

@Service
public class StravaService {
    private static final Logger logger = LoggerFactory.getLogger(StravaService.class);

    private final RestClient restClient;
    private final String clientId;
    private final String clientSecret;
    
    private String accessToken;
    private String refreshToken;
    private long expiresAt;

    private static final long CACHE_TTL_MS = 10 * 60 * 1000;
    private static final int CACHE_MAX_ENTRIES = 120;
    private final Map<String, CachedResponse> cache = new ConcurrentHashMap<>();

    public StravaService(
            @Value("${strava.client.id:}") String clientId,
            @Value("${strava.client.secret:}") String clientSecret,
            @Value("${strava.access.token:}") String accessToken,
            @Value("${strava.refresh.token:}") String refreshToken) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.expiresAt = 0;
        this.restClient = RestClient.builder().build();
    }

    public boolean isConfigured() {
        return clientId != null && !clientId.isEmpty() && accessToken != null && !accessToken.isEmpty();
    }

    private synchronized void refreshAccessTokenIfNeeded() {
        if (!isConfigured()) return;
        if (expiresAt != 0 && Instant.now().getEpochSecond() > expiresAt - 300) {
            try {
                MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
                body.add("client_id", clientId);
                body.add("client_secret", clientSecret);
                body.add("grant_type", "refresh_token");
                body.add("refresh_token", refreshToken);

                StravaTokenResponse tokenResponse = restClient.post()
                        .uri("https://www.strava.com/oauth/token")
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .body(body)
                        .retrieve()
                        .body(StravaTokenResponse.class);

                if (tokenResponse != null && tokenResponse.accessToken() != null) {
                    this.accessToken = tokenResponse.accessToken();
                    this.refreshToken = tokenResponse.refreshToken();
                    this.expiresAt = tokenResponse.expiresAt();
                }
            } catch (Exception e) {
                logger.error("Failed to refresh Strava token", e);
            }
        }
    }

    public StravaExploreResult exploreSegments(double[] bounds, String activity) {
        if (!isConfigured()) {
            return new StravaExploreResult("mock", List.of(), "Missing Strava environment variables.");
        }

        List<String> activities = "all".equals(activity) ? List.of("running", "riding") : List.of(activity);
        List<StravaSegment> segments = new ArrayList<>();

        for (String act : activities) {
            String url = String.format("https://www.strava.com/api/v3/segments/explore?bounds=%f,%f,%f,%f&activity_type=%s",
                    bounds[0], bounds[1], bounds[2], bounds[3], act);
            
            try {
                StravaExplorerResponse response = getCachedOrFetch(url);
                if (response != null && response.segments() != null) {
                    segments.addAll(normalize(response.segments(), act));
                }
            } catch (org.springframework.web.client.HttpClientErrorException.TooManyRequests e) {
                return new StravaExploreResult("mock", List.of(), "Strava API rate limit reached, falling back to mock routes.");
            }
        }

        return new StravaExploreResult("strava-api", segments, null);
    }

    private StravaExplorerResponse getCachedOrFetch(String url) {
        CachedResponse cached = cache.get(url);
        if (cached != null && cached.expiresAt() > System.currentTimeMillis()) {
            return cached.response();
        }

        refreshAccessTokenIfNeeded();

        try {
            StravaExplorerResponse response = restClient.get()
                    .uri(url)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                    .retrieve()
                    .body(StravaExplorerResponse.class);

            if (response != null) {
                if (cache.size() >= CACHE_MAX_ENTRIES) {
                    cache.clear(); 
                }
                cache.put(url, new CachedResponse(System.currentTimeMillis() + CACHE_TTL_MS, response));
            }
            return response;
        } catch (org.springframework.web.client.HttpClientErrorException.TooManyRequests e) {
            logger.warn("Strava API rate limit reached");
            throw e;
        } catch (Exception e) {
            logger.error("Failed to fetch Strava segments", e);
            return null;
        }
    }

    private List<StravaSegment> normalize(List<StravaRawSegment> rawSegments, String activityType) {
        List<StravaSegment> normalized = new ArrayList<>();
        String normalizedActivity = "riding".equals(activityType) ? "cycling" : "running";

        for (StravaRawSegment raw : rawSegments) {
            List<LatLng> geometry = null;
            if (raw.points() != null && !raw.points().isEmpty()) {
                geometry = GeoUtils.decodePolyline(raw.points());
            } else if (raw.startLatlng() != null && raw.endLatlng() != null) {
                geometry = List.of(
                        new LatLng(raw.startLatlng().get(0), raw.startLatlng().get(1)),
                        new LatLng(raw.endLatlng().get(0), raw.endLatlng().get(1))
                );
            }

            if (geometry == null || geometry.size() < 2) continue;

            double distanceKm = Math.round((raw.distance() / 1000.0) * 10.0) / 10.0;
            int elevationGainM = raw.elevDifference() != null ? (int) Math.max(0, Math.round(raw.elevDifference())) : 0;
            int durationMin = Math.max(1, (int) Math.round(distanceKm * ("cycling".equals(normalizedActivity) ? 3.1 : 5.6)));

            int climbCategory = raw.climbCategory() == null ? 0 : raw.climbCategory();
            double avgGrade = raw.avgGrade() == null ? 0 : raw.avgGrade();
            boolean starred = raw.starred() != null && raw.starred();

            double climbPenalty = Math.min(28, Math.abs(avgGrade) * 3 + climbCategory * 5);
            double sceneryBoost = Math.min(20, climbCategory * 4 + Math.abs(avgGrade) * 1.5);

            StravaSignals signals = new StravaSignals(
                    54, 44, 32,
                    (int) Math.max(52, 76 - climbPenalty * 0.4),
                    starred ? 62 : 56,
                    (int) Math.min(88, 58 + sceneryBoost),
                    74, 24
            );

            normalized.add(new StravaSegment(
                    "strava-segment-" + raw.id(),
                    "strava",
                    raw.name(),
                    normalizedActivity,
                    distanceKm,
                    elevationGainM,
                    durationMin,
                    "point_to_point",
                    geometry,
                    signals
            ));
        }
        return normalized;
    }

    public record StravaSegment(
            String id, String source, String name, String activity, double distanceKm,
            int elevationGainM, int estimatedDurationMin, String routeType,
            List<LatLng> geometry, StravaSignals signals) {}

    public record StravaSignals(
            int park, int water, int shade, int pedestrian,
            int popular, int scenic, int elevation, int total) {}

    public record StravaExploreResult(String source, List<StravaSegment> segments, String message) {}

    private record CachedResponse(long expiresAt, StravaExplorerResponse response) {}

    private record StravaTokenResponse(
            @JsonProperty("access_token") String accessToken,
            @JsonProperty("refresh_token") String refreshToken,
            @JsonProperty("expires_at") long expiresAt) {}

    private record StravaExplorerResponse(List<StravaRawSegment> segments) {}

    private record StravaRawSegment(
            long id, String name,
            @JsonProperty("climb_category") Integer climbCategory,
            @JsonProperty("avg_grade") Double avgGrade,
            @JsonProperty("start_latlng") List<Double> startLatlng,
            @JsonProperty("end_latlng") List<Double> endLatlng,
            @JsonProperty("elev_difference") Double elevDifference,
            double distance, String points, Boolean starred) {}
}
