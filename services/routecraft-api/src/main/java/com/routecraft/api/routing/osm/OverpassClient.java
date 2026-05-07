package com.routecraft.api.routing.osm;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import com.routecraft.api.routing.model.LatLng;

@Component
public class OverpassClient {

    private static final Logger log = LoggerFactory.getLogger(OverpassClient.class);

    private static final List<String> ENDPOINTS = List.of(
            "https://overpass-api.de/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter",
            "https://overpass.openstreetmap.ru/api/interpreter");

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public OverpassClient(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    public List<OsmElement> fetch(BBox bbox) {
        String body = "data=" + URLEncoder.encode(buildQuery(bbox), StandardCharsets.UTF_8);
        Throwable lastError = null;
        for (String endpoint : ENDPOINTS) {
            try {
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(endpoint))
                        .timeout(Duration.ofSeconds(25))
                        .header("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8")
                        .header("User-Agent", "RouteCraft local route generation")
                        .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                        .build();
                HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() < 200 || response.statusCode() >= 300) {
                    throw new RuntimeException("Overpass request failed with " + response.statusCode());
                }
                return parseElements(response.body());
            } catch (Exception ex) {
                lastError = ex;
                log.debug("Overpass endpoint {} failed: {}", endpoint, ex.getMessage());
            }
        }
        throw new RuntimeException("All Overpass endpoints failed", lastError);
    }

    private String buildQuery(BBox bbox) {
        String bounds = bbox.south() + "," + bbox.west() + "," + bbox.north() + "," + bbox.east();
        return """
                [out:json][timeout:25];
                (
                  way["highway"~"^(footway|path|cycleway|pedestrian|residential|living_street|track|service|unclassified|tertiary|secondary|primary)$"](%s);
                  way["leisure"~"^(park|garden|nature_reserve|recreation_ground)$"](%s);
                  way["landuse"~"^(forest|grass|meadow|recreation_ground|village_green|cemetery)$"](%s);
                  way["natural"~"^(wood|scrub|grassland|heath|water)$"](%s);
                );
                out body geom;
                """.formatted(bounds, bounds, bounds, bounds);
    }

    public List<OsmElement> parseElements(String jsonBody) {
        JsonNode root = objectMapper.readTree(jsonBody);
        JsonNode elements = root.path("elements");
        return parseElementsNode(elements);
    }

    public List<OsmElement> parseElementsNode(JsonNode elementsNode) {
        if (elementsNode == null || !elementsNode.isArray()) {
            return List.of();
        }
        List<OsmElement> result = new ArrayList<>(elementsNode.size());
        for (JsonNode el : elementsNode) {
            String type = el.path("type").asString(null);
            long id = el.path("id").asLong(0);
            List<Long> nodes = parseNodeIds(el.path("nodes"));
            List<LatLng> geometry = parseGeometry(el.path("geometry"));
            Map<String, String> tags = parseTags(el.path("tags"));
            result.add(new OsmElement(type, id, nodes, geometry, tags));
        }
        return result;
    }

    private static List<Long> parseNodeIds(JsonNode node) {
        if (node == null || !node.isArray()) return null;
        List<Long> ids = new ArrayList<>(node.size());
        for (JsonNode id : node) {
            if (id.isNumber()) ids.add(id.asLong());
        }
        return ids;
    }

    private static List<LatLng> parseGeometry(JsonNode node) {
        if (node == null || !node.isArray()) return null;
        List<LatLng> points = new ArrayList<>(node.size());
        for (JsonNode pt : node) {
            JsonNode latNode = pt.path("lat");
            JsonNode lngNode = pt.has("lng") ? pt.path("lng") : pt.path("lon");
            if (latNode.isNumber() && lngNode.isNumber()) {
                points.add(new LatLng(latNode.asDouble(), lngNode.asDouble()));
            }
        }
        return points;
    }

    private static Map<String, String> parseTags(JsonNode node) {
        if (node == null || !node.isObject()) return null;
        Map<String, String> tags = new HashMap<>();
        node.properties().forEach(entry -> {
            JsonNode value = entry.getValue();
            if (value != null && value.isTextual()) {
                tags.put(entry.getKey(), value.asString());
            }
        });
        return tags;
    }
}
