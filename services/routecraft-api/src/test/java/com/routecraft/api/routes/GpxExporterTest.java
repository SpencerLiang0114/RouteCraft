package com.routecraft.api.routes;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

class GpxExporterTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void convertsGeometryPayloadIntoGpxTrack() {
        JsonNode payload = objectMapper.readTree("""
                {
                  "name": "Morning loop",
                  "savedAt": "2026-04-01T08:30:00Z",
                  "geometry": [
                    {"lat": 37.78, "lng": -122.41},
                    {"lat": 37.79, "lng": -122.42}
                  ],
                  "elevationProfile": [
                    {"distanceKm": 0, "elevM": 12.5},
                    {"distanceKm": 0.2, "elevM": 18}
                  ]
                }
                """);

        String gpx = GpxExporter.toGpx(payload);

        assertTrue(gpx.contains("<gpx version=\"1.1\" creator=\"RouteCraft\""));
        assertTrue(gpx.contains("xmlns=\"http://www.topografix.com/GPX/1/1\""));
        assertTrue(gpx.contains("<name>Morning loop</name>"));
        assertTrue(gpx.contains("<time>2026-04-01T08:30:00Z</time>"));
        assertTrue(gpx.contains("<trkpt lat=\"37.78\" lon=\"-122.41\">"));
        assertTrue(gpx.contains("<trkpt lat=\"37.79\" lon=\"-122.42\">"));
        assertTrue(gpx.contains("<ele>12.5</ele>"));
        assertTrue(gpx.contains("<ele>18</ele>"));
    }

    @Test
    void rejectsGeometryWithFewerThanTwoPoints() {
        JsonNode payload = objectMapper.readTree("""
                {
                  "name": "Too short",
                  "geometry": [
                    {"lat": 37.78, "lng": -122.41}
                  ]
                }
                """);

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> GpxExporter.toGpx(payload));
        assertTrue(error.getMessage().contains("at least two points"));
    }
}
