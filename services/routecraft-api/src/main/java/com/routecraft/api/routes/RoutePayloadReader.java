package com.routecraft.api.routes;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.format.DateTimeParseException;

import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

@Component
class RoutePayloadReader {

    private final ObjectMapper objectMapper;

    RoutePayloadReader(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    RouteSnapshot readRoute(JsonNode payload, boolean normalizeSavedAt) {
        if (payload == null || !payload.isObject()) {
            throw new IllegalArgumentException("Route payload must be a JSON object.");
        }

        ObjectNode normalized = (ObjectNode) payload.deepCopy();
        Instant savedAt = readSavedAt(normalized);
        if (normalizeSavedAt && savedAt == null) {
            savedAt = Instant.now();
            normalized.put("savedAt", savedAt.toString());
        }

        return new RouteSnapshot(
                requiredText(normalized, "id"),
                requiredText(normalized, "source"),
                requiredText(normalized, "name"),
                requiredText(normalized, "activity"),
                optionalText(normalized, "routeType"),
                requiredDecimal(normalized, "distanceKm"),
                requiredInt(normalized, "estimatedDurationMin"),
                requiredDecimal(normalized, "elevationGainM"),
                lineStringGeoJson(normalized.get("geometry")),
                normalized,
                savedAt);
    }

    String toJson(JsonNode payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JacksonException error) {
            throw new IllegalArgumentException("Could not serialize JSON payload.");
        }
    }

    JsonNode readJson(String payload) {
        try {
            return objectMapper.readTree(payload);
        } catch (JacksonException error) {
            throw new IllegalArgumentException("Could not parse stored JSON payload.");
        }
    }

    private String lineStringGeoJson(JsonNode geometry) {
        if (geometry == null || !geometry.isArray() || geometry.size() < 2) {
            throw new IllegalArgumentException("Route geometry must contain at least two points.");
        }

        ObjectNode lineString = objectMapper.createObjectNode();
        ArrayNode coordinates = objectMapper.createArrayNode();
        for (JsonNode point : geometry) {
            ArrayNode coordinate = objectMapper.createArrayNode();
            coordinate.add(requiredCoordinate(point, "lng", -180, 180));
            coordinate.add(requiredCoordinate(point, "lat", -90, 90));
            coordinates.add(coordinate);
        }

        lineString.put("type", "LineString");
        lineString.set("coordinates", coordinates);
        return toJson(lineString);
    }

    private String requiredText(JsonNode payload, String field) {
        String value = optionalText(payload, field);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " is required.");
        }
        return value;
    }

    private String optionalText(JsonNode payload, String field) {
        JsonNode value = payload.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        if (!value.isTextual()) {
            throw new IllegalArgumentException(field + " must be a string.");
        }
        return value.asText();
    }

    private BigDecimal requiredDecimal(JsonNode payload, String field) {
        JsonNode value = payload.get(field);
        if (value == null || !value.isNumber()) {
            throw new IllegalArgumentException(field + " must be a number.");
        }
        return value.decimalValue();
    }

    private int requiredInt(JsonNode payload, String field) {
        JsonNode value = payload.get(field);
        if (value == null || !value.isNumber()) {
            throw new IllegalArgumentException(field + " must be a number.");
        }
        return value.asInt();
    }

    private double requiredCoordinate(JsonNode point, String field, double min, double max) {
        if (point == null || !point.isObject()) {
            throw new IllegalArgumentException("Route geometry points must be objects.");
        }
        JsonNode value = point.get(field);
        if (value == null || !value.isNumber()) {
            throw new IllegalArgumentException("Route geometry point " + field + " must be a number.");
        }
        double coordinate = value.asDouble();
        if (!Double.isFinite(coordinate) || coordinate < min || coordinate > max) {
            throw new IllegalArgumentException("Route geometry point " + field + " is out of range.");
        }
        return coordinate;
    }

    private Instant readSavedAt(JsonNode payload) {
        JsonNode value = payload.get("savedAt");
        if (value == null || value.isNull()) {
            return null;
        }
        if (!value.isTextual()) {
            throw new IllegalArgumentException("savedAt must be an ISO timestamp.");
        }
        try {
            return Instant.parse(value.asText());
        } catch (DateTimeParseException error) {
            throw new IllegalArgumentException("savedAt must be an ISO timestamp.");
        }
    }
}
