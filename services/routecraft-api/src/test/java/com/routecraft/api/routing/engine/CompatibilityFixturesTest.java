package com.routecraft.api.routing.engine;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.*;
import tools.jackson.databind.json.JsonMapper;
import com.routecraft.api.routing.graph.*;
import com.routecraft.api.routing.model.*;
import com.routecraft.api.routing.osm.*;

/** Recorded OSM with fixed (deliberately non-live) elevation responses. */
class CompatibilityFixturesTest {
    static final Path FIXTURES = Path.of("../routing-compat/fixtures");
    static final ObjectMapper MAPPER = JsonMapper.builder().build();

    @Test void recordedJavaReferenceRemainsCompatible() throws Exception {
        boolean record = Boolean.getBoolean("routecraft.recordFixtures");
        int cases = 0;
        for (String area : List.of("urban", "park", "hilly")) {
            var input = MAPPER.readTree(Files.readString(FIXTURES.resolve(area + ".json")));
            var elements = new OverpassClient(MAPPER).parseElementsNode(input.get("elements"));
            var start = MAPPER.treeToValue(input.get("startPoint"), LatLng.class);
            for (ActivityType activity : ActivityType.values()) for (RouteType type : RouteType.values()) {
                for (int variant = 0; variant < 2; variant++) {
                    double preference = variant == 0 ? 0 : 3;
                    var prefs = new UserPreferences(activity, type, variant == 0 ? 2.0 : null,
                            variant == 1 ? 14.0 : null, start, type == RouteType.POINT_TO_POINT
                            ? GeoUtils.destinationPoint(start, 65, 900) : null,
                            preference, preference, preference, preference, preference,
                            variant == 0 ? "afternoon" : "night", variant == 0 ? RouteStyle.PARK_HEAVY : RouteStyle.CLIMBING);
                    var raw = OsmGraphBuilder.createEdges(elements, OsmGraphBuilder.getGreenFeatures(elements), Map.of(), prefs);
                    var trimmed = OsmGraphBuilder.trimToLocalGraph(start, raw.nodes(), raw.edges(), prefs);
                    // Fixed provider responses, including missing keys, with Spring's exact cap/order.
                    var points = new ArrayList<>(trimmed.nodes().stream().map(RouteNode::point).toList());
                    points.sort(Comparator.comparingDouble(pt -> GeoUtils.distanceM(start, pt)));
                    var elevations = new LinkedHashMap<String, Double>();
                    int i = 0;
                    for (var pt : points) {
                        String key = ElevationService.nodeKey(pt);
                        if (elevations.containsKey(key)) continue;
                        if (i++ % 11 != 0) elevations.put(key, GeoUtils.round(100 + (pt.lat() - start.lat()) * (area.equals("hilly") ? 8000 : 100), 1));
                        if (elevations.size() >= 800) break;
                    }
                    String name = area + "-" + activity.value() + "-" + type.value() + "-" + variant;
                    var reference = new LinkedHashMap<String, Object>();
                    reference.put("preferences", prefs);
                    reference.put("elevations", elevations);
                    reference.put("raw", snapshot(raw));
                    reference.put("trimmed", snapshot(trimmed));
                    var withStart = OsmGraphBuilder.addAnchorNode("user-start", start, trimmed.nodes(), OsmGraphBuilder.applyElevationsToEdges(trimmed.edges(), elevations));
                    var withEnd = OsmGraphBuilder.addAnchorNode("user-end", prefs.endPoint(), withStart.nodes(), withStart.edges());
                    reference.put("finalGraph", snapshot(new OsmGraphBuilder.GraphDraft(withEnd.nodes(), RouteGraph.bidirectional(withEnd.edges()))));
                    try (var prepared = new JavaRoutingEngine().prepare(elements, prefs)) {
                        reference.put("candidates", prepared.generate(elevations));
                    }
                    var actual = MAPPER.valueToTree(reference);
                    Path expected = FIXTURES.resolve(name + ".reference.json.gz");
                    if (record) {
                        try (var out = new java.util.zip.GZIPOutputStream(Files.newOutputStream(expected))) { out.write(MAPPER.writeValueAsBytes(actual)); }
                    } else {
                        try (var in = new java.util.zip.GZIPInputStream(Files.newInputStream(expected))) { compare(MAPPER.readTree(in), actual, name); }
                    }
                    cases++;
                }
            }
        }
        assertEquals(54, cases);
    }

    private static void compare(JsonNode expected, JsonNode actual, String path) {
        assertNotNull(actual, path);
        if (expected.isNumber() && actual.isNumber()) {
            double value = expected.asDouble();
            boolean rounded = path.contains(".candidates") && !path.contains(".geometry")
                    && !path.contains(".waypoints")
                    && (!path.contains(".metrics") || path.endsWith(".totalScore"));
            assertEquals(value, actual.asDouble(), rounded ? 0 : Math.max(1e-6, Math.abs(value) * 1e-6), path);
        } else if (expected.isObject() && actual.isObject()) {
            assertEquals(expected.size(), actual.size(), path + " fields");
            expected.properties().forEach(field -> compare(field.getValue(), actual.get(field.getKey()), path + "." + field.getKey()));
        } else if (expected.isArray() && actual.isArray()) {
            assertEquals(expected.size(), actual.size(), path + " length");
            for (int i = 0; i < expected.size(); i++) compare(expected.get(i), actual.get(i), path + "[" + i + "]");
        } else {
            assertEquals(expected, actual, path);
        }
    }

    @Test void toleratesInternalPlatformRoundingButPreservesPublishedValues() {
        compare(MAPPER.readTree("0.46659902318361124"), MAPPER.readTree("0.46659902318361135"), "raw.parkScore");
        assertThrows(AssertionError.class, () -> compare(MAPPER.readTree("0.4"), MAPPER.readTree("0.40001"), "raw.parkScore"));
        assertThrows(AssertionError.class, () -> compare(MAPPER.readTree("1.23"), MAPPER.readTree("1.2300001"), "fixture.candidates[0].distanceKm"));
    }

    static Object snapshot(OsmGraphBuilder.GraphDraft draft) throws Exception {
        var edges = new ArrayList<Map<String, Object>>();
        for (var edge : draft.edges()) {
            var fields = new TreeMap<String, Object>();
            for (var method : RouteEdge.class.getDeclaredMethods()) {
                if (method.getParameterCount() == 0 && !Set.of("toBuilder", "builder", "reverse").contains(method.getName())) {
                    fields.put(method.getName(), method.invoke(edge));
                }
            }
            edges.add(fields);
        }
        return Map.of("nodes", draft.nodes(), "edges", edges);
    }
}
