package com.routecraft.api.routes;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

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

    @Test
    void interpolatesElevationWhenProfileLengthDiffersFromGeometry() {
        JsonNode payload = objectMapper.readTree("""
                {
                  "name": "Resampled climb",
                  "geometry": [
                    {"lat": 37.78, "lng": -122.41},
                    {"lat": 37.785, "lng": -122.415},
                    {"lat": 37.79, "lng": -122.42}
                  ],
                  "elevationProfile": [
                    {"distanceKm": 0, "elevM": 10},
                    {"distanceKm": 10, "elevM": 110}
                  ]
                }
                """);

        String gpx = GpxExporter.toGpx(payload);

        assertTrue(gpx.contains("<ele>10</ele>"));
        assertEquals(3, gpx.split("<trkpt ", -1).length - 1);
        assertEquals(3, gpx.split("<ele>", -1).length - 1);
    }

    @Test
    void stripsXmlIllegalCharactersFromRouteName() {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("name", "Morning\u0000 loop");
        ArrayNode geometry = payload.putArray("geometry");
        geometry.addObject().put("lat", 37.78).put("lng", -122.41);
        geometry.addObject().put("lat", 37.79).put("lng", -122.42);

        String gpx = GpxExporter.toGpx(payload);

        assertTrue(gpx.contains("<name>Morning loop</name>"));
        assertFalse(gpx.contains("\u0000"));
    }

    @Test
    void sanitizesContentDispositionFilename() {
        assertEquals("attachment; filename=\"route-1.gpx\"", SavedRoutesController.gpxContentDisposition("route-1"));
        String injected = SavedRoutesController.gpxContentDisposition("id\"\r\nLocation: evil");
        assertFalse(injected.contains("\r"));
        assertFalse(injected.contains("\n"));
        assertTrue(injected.startsWith("attachment; filename=\""));
        assertTrue(injected.endsWith(".gpx\""));
    }
}
