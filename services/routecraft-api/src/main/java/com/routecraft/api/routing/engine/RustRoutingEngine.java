package com.routecraft.api.routing.engine;

import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.JsonNode;
import com.routecraft.api.routing.model.*;
import com.routecraft.api.routing.osm.OsmElement;

@Component
public class RustRoutingEngine implements RoutingEngine {
    private final URI base;
    private final Duration timeout;
    private final HttpClient client;
    private final ObjectMapper mapper;
    public RustRoutingEngine(ObjectMapper mapper,
            @Value("${routecraft.routing.engine-url:http://routecraft-engine:8090}") String url,
            @Value("${routecraft.routing.engine-budget-seconds:30}") long seconds) {
        this.mapper = mapper;
        this.base = URI.create(url);
        if (seconds <= 0) throw new IllegalArgumentException("Engine budget must be positive");
        this.timeout = Duration.ofSeconds(seconds + 2);
        this.client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
    }
    @Override public PreparedGraph prepare(List<OsmElement> elements, UserPreferences preferences) {
        JsonNode response = call("POST", "/internal/v1/graphs/prepare", Map.of("elements", elements, "preferences", preferences), timeout);
        String handle = response.path("handle").asString("");
        try {
            UUID.fromString(handle);
        } catch (IllegalArgumentException ex) { throw new EngineUnavailableException("malformed_response"); }
        try {
            requireVersion(response);
            JsonNode points = response.get("nodePoints");
            if (points == null || !points.isArray() || points.size() > 50000) throw new EngineUnavailableException("malformed_response");
            List<LatLng> nodePoints = new ArrayList<>();
            for (JsonNode point : points) {
                if (!point.path("lat").isNumber() || !point.path("lng").isNumber()) throw new EngineUnavailableException("malformed_response");
                LatLng value = mapper.treeToValue(point, LatLng.class);
                if (!value.isValid()) throw new EngineUnavailableException("malformed_response");
                nodePoints.add(value);
            }
            return new RustPrepared(handle, List.copyOf(nodePoints), preferences);
        } catch (RuntimeException ex) {
            release(handle);
            if (ex instanceof EngineUnavailableException unavailable) throw unavailable;
            throw new EngineUnavailableException("malformed_response");
        }
    }
    private record CandidateEnvelope(List<RouteCandidate> candidates, int protocolVersion) { }
    private final class RustPrepared implements PreparedGraph {
        private final String handle;
        private final List<LatLng> points;
        private final UserPreferences preferences;
        RustPrepared(String handle, List<LatLng> points, UserPreferences preferences) {
            this.handle = handle; this.points = points; this.preferences = preferences;
        }
        @Override public List<LatLng> nodePoints() { return points; }
        @Override public List<RouteCandidate> generate(Map<String, Double> elevations) {
            JsonNode response = call("POST", "/internal/v1/graphs/" + handle + "/generate", Map.of("elevations", elevations), timeout);
            requireVersion(response);
            try {
                CandidateEnvelope envelope = mapper.treeToValue(response, CandidateEnvelope.class);
                if (envelope.candidates() == null || envelope.candidates().isEmpty() || envelope.candidates().size() > 3) throw new EngineUnavailableException("malformed_response");
                var ids = new HashSet<String>();
                for (RouteCandidate candidate : envelope.candidates()) {
                    if (candidate == null || candidate.id() == null || !ids.add(candidate.id())
                            || candidate.source() != RouteSource.GENERATED || candidate.activity() != preferences.activity()
                            || candidate.routeType() != preferences.routeType() || candidate.name() == null
                            || candidate.geometry() == null || candidate.geometry().size() < 2
                            || candidate.geometry().stream().anyMatch(p -> p == null || !p.isValid())
                            || candidate.waypoints() == null || candidate.waypoints().stream().anyMatch(p -> p == null || !p.isValid())
                            || candidate.difficulty() == null || candidate.metrics() == null || candidate.explanation() == null
                            || !Double.isFinite(candidate.distanceKm()) || candidate.distanceKm() < 0) {
                        throw new EngineUnavailableException("malformed_response");
                    }
                }
                return envelope.candidates();
            } catch (EngineUnavailableException ex) { throw ex; }
            catch (RuntimeException ex) { throw new EngineUnavailableException("malformed_response"); }
        }
        @Override public void close() { release(handle); }
    }
    private void release(String handle) {
        try { call("DELETE", "/internal/v1/graphs/" + handle, null, Duration.ofSeconds(2)); }
        catch (RuntimeException ignored) { /* Restarted/expired handles are reclaimed by the engine TTL. */ }
    }
    private static void requireVersion(JsonNode response) {
        if (response.path("protocolVersion").asInt(-1) != 1) throw new EngineUnavailableException("protocol_mismatch");
    }
    private JsonNode call(String method, String path, Object body, Duration timeout) {
        try (var stage = RoutingTimings.stage("engine_transport", "rust", null)) {
            byte[] payload = body == null ? new byte[0] : mapper.writeValueAsBytes(body);
            stage.bytes(payload.length);
            HttpRequest request = HttpRequest.newBuilder(base.resolve(path)).timeout(timeout)
                    .header("Content-Type", "application/json")
                    .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofByteArray(payload)).build();
            HttpResponse<byte[]> response = client.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() == 204 && method.equals("DELETE")) return mapper.createObjectNode();
            JsonNode parsed;
            try { parsed = mapper.readTree(response.body()); }
            catch (RuntimeException ex) { throw new EngineUnavailableException("malformed_response"); }
            if (parsed == null || !parsed.isObject()) throw new EngineUnavailableException("malformed_response");
            if (response.statusCode() >= 200 && response.statusCode() < 300) return parsed;
            requireVersion(parsed);
            String code = parsed.path("code").asString("");
            if (response.statusCode() == 422 && code.equals("insufficient_graph_data")) throw new IllegalStateException(JavaRoutingEngine.INSUFFICIENT_DATA);
            if (response.statusCode() == 422 && code.equals("no_route")) throw new IllegalStateException(JavaRoutingEngine.NO_ROUTE);
            throw new EngineUnavailableException(switch (code) {
                case "expired_handle", "overload", "timeout", "malformed_input" -> code;
                default -> "engine_failure";
            });
        } catch (EngineUnavailableException | IllegalStateException ex) { throw ex; }
        catch (InterruptedException ex) { Thread.currentThread().interrupt(); throw new EngineUnavailableException("interrupted"); }
        catch (Exception ex) { throw new EngineUnavailableException("transport_failure"); }
    }
}
