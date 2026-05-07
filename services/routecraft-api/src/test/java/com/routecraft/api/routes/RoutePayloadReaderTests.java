package com.routecraft.api.routes;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

class RoutePayloadReaderTests {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final RoutePayloadReader reader = new RoutePayloadReader(objectMapper);

    @Test
    void convertsLatLngGeometryToGeoJsonLineString() {
        ObjectNode route = validRoute();

        RouteSnapshot snapshot = reader.readRoute(route, true);

        assertEquals("route-1", snapshot.id());
        assertTrue(snapshot.geometryGeoJson().contains("\"type\":\"LineString\""));
        assertTrue(snapshot.geometryGeoJson().contains("[-122.41,37.78]"));
        assertTrue(snapshot.payload().hasNonNull("savedAt"));
    }

    @Test
    void rejectsRoutesWithoutEnoughGeometry() {
        ObjectNode route = validRoute();
        route.putArray("geometry").addObject().put("lat", 37.78).put("lng", -122.41);

        assertThrows(IllegalArgumentException.class, () -> reader.readRoute(route, true));
    }

    private ObjectNode validRoute() {
        ObjectNode route = objectMapper.createObjectNode();
        route.put("id", "route-1");
        route.put("source", "generated");
        route.put("name", "Morning loop");
        route.put("activity", "running");
        route.put("routeType", "loop");
        route.put("distanceKm", 6.4);
        route.put("estimatedDurationMin", 42);
        route.put("elevationGainM", 85);
        route.put("explanation", "Balanced route");

        ObjectNode metrics = route.putObject("metrics");
        metrics.put("totalScore", 88);

        ArrayNode geometry = route.putArray("geometry");
        geometry.addObject().put("lat", 37.78).put("lng", -122.41);
        geometry.addObject().put("lat", 37.79).put("lng", -122.42);

        return route;
    }
}
