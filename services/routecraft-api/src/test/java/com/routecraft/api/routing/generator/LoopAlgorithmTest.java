package com.routecraft.api.routing.generator;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.routecraft.api.routing.graph.GeoUtils;
import com.routecraft.api.routing.model.LatLng;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit tests for loop-generation helper logic.
 *
 * Tests are deliberately unit-scoped (no Spring context, no OSM load) — they exercise the
 * pure geometric and scoring functions that are the core of the refactored algorithm.
 */
class LoopAlgorithmTest {

    // ------------------------------------------------------------------
    // CandidateSelector.isNonDegenerate
    // ------------------------------------------------------------------

    @Test
    void isNonDegenerate_rejectsCollinearWaypoints() {
        // Three points in a straight line north from the origin
        LatLng pivot = new LatLng(40.0, -105.0);
        LatLng a = GeoUtils.destinationPoint(pivot, 0, 1000);   // due north 1 km
        LatLng b = GeoUtils.destinationPoint(pivot, 0, 2000);   // due north 2 km — same bearing

        assertFalse(CandidateSelector.isNonDegenerate(pivot, a, b),
                "Collinear waypoints (same bearing) should be degenerate");
    }

    @Test
    void isNonDegenerate_acceptsEquilateralWaypoints() {
        LatLng pivot = new LatLng(40.0, -105.0);
        LatLng a = GeoUtils.destinationPoint(pivot, 0, 1000);    // north
        LatLng b = GeoUtils.destinationPoint(pivot, 120, 1000);  // 120° away

        assertTrue(CandidateSelector.isNonDegenerate(pivot, a, b),
                "120° separation should pass degenerate check");
    }

    @Test
    void isNonDegenerate_acceptsSemicircularWaypoints() {
        LatLng pivot = new LatLng(40.0, -105.0);
        LatLng a = GeoUtils.destinationPoint(pivot, 90, 1000);   // east
        LatLng b = GeoUtils.destinationPoint(pivot, 270, 1000);  // west (180° apart)

        assertTrue(CandidateSelector.isNonDegenerate(pivot, a, b),
                "Opposite waypoints (180°) should pass degenerate check");
    }

    @Test
    void isNonDegenerate_rejectsNearCollinear() {
        // 10° separation — should be rejected (threshold is 25°)
        LatLng pivot = new LatLng(40.0, -105.0);
        LatLng a = GeoUtils.destinationPoint(pivot, 45, 1000);
        LatLng b = GeoUtils.destinationPoint(pivot, 55, 1000);

        assertFalse(CandidateSelector.isNonDegenerate(pivot, a, b),
                "10° separation is below the 25° threshold — should be degenerate");
    }

    // ------------------------------------------------------------------
    // GeoUtils.distanceToleranceRatio
    // ------------------------------------------------------------------

    @Test
    void distanceToleranceRatio_isReasonableForShortRoutes() {
        // At 3 km: expect roughly 20 %
        double ratio = GeoUtils.distanceToleranceRatio(3.0);
        assertTrue(ratio >= 0.15 && ratio <= 0.25,
                "3 km tolerance should be in [15 %, 25 %], got: " + ratio);
    }

    @Test
    void distanceToleranceRatio_isReasonableForLongRoutes() {
        // At 20 km: expect roughly 8 %
        double ratio = GeoUtils.distanceToleranceRatio(20.0);
        assertTrue(ratio >= 0.07 && ratio <= 0.12,
                "20 km tolerance should be in [7 %, 12 %], got: " + ratio);
    }

    @Test
    void distanceToleranceRatio_neverDropsBelowFloor() {
        // For very long routes the formula should not go below 8 %
        double ratio = GeoUtils.distanceToleranceRatio(200.0);
        assertTrue(ratio >= 0.08,
                "Tolerance must never drop below 8 %, got: " + ratio);
    }

    @Test
    void distanceToleranceRatio_shortIsGreaterThanLong() {
        double shortRatio = GeoUtils.distanceToleranceRatio(3.0);
        double longRatio = GeoUtils.distanceToleranceRatio(15.0);
        assertTrue(shortRatio > longRatio,
                "Short-route tolerance should exceed long-route tolerance");
    }

    // ------------------------------------------------------------------
    // RouteDiversity — centroid check
    // ------------------------------------------------------------------

    @Test
    void filterDiverseRoutes_keepsBothWhenCentroidsAreFar() {
        // Two routes with centroids 5 km apart — should both survive with 1 km threshold
        List<GeneratedRouteCandidate> routes = List.of(
                makeDummyCandidate("r1", new LatLng(40.000, -105.000), 5.0),
                makeDummyCandidate("r2", new LatLng(40.045, -105.000), 5.0)  // ~5 km north
        );

        List<GeneratedRouteCandidate> result = RouteDiversity.filterDiverseRoutes(routes, 0.7, 1.0);
        assertTrue(result.size() == 2,
                "Both candidates should survive when centroids are far apart");
    }

    @Test
    void filterDiverseRoutes_dedupesWhenCentroidsAreClose() {
        // Two routes with centroids ~0.1 km apart — should deduplicate with 0.5 km threshold
        List<GeneratedRouteCandidate> routes = List.of(
                makeDummyCandidate("r1", new LatLng(40.000, -105.000), 5.0),
                makeDummyCandidate("r2", new LatLng(40.001, -105.000), 5.0)  // ~0.1 km
        );

        List<GeneratedRouteCandidate> result = RouteDiversity.filterDiverseRoutes(routes, 0.7, 0.5);
        assertTrue(result.size() == 1,
                "Candidates with nearby centroids should be deduplicated");
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /**
     * Creates a minimal GeneratedRouteCandidate with a trivial geometry centred at
     * {@code centroid} and a given distance, carrying no shared edges with other candidates.
     */
    private static GeneratedRouteCandidate makeDummyCandidate(
            String id, LatLng centroid, double distanceKm) {

        // Build a tiny square geometry around the centroid so it has a meaningful centroid
        double delta = 0.005; // ~0.5 km
        List<LatLng> geometry = List.of(
                new LatLng(centroid.lat() + delta, centroid.lng() - delta),
                new LatLng(centroid.lat() + delta, centroid.lng() + delta),
                new LatLng(centroid.lat() - delta, centroid.lng() + delta),
                new LatLng(centroid.lat() - delta, centroid.lng() - delta),
                new LatLng(centroid.lat() + delta, centroid.lng() - delta));

        com.routecraft.api.routing.model.RouteCandidate rc =
                new com.routecraft.api.routing.model.RouteCandidate(
                        id,
                        com.routecraft.api.routing.model.RouteSource.GENERATED,
                        "Test Route",
                        com.routecraft.api.routing.model.ActivityType.RUNNING,
                        com.routecraft.api.routing.model.RouteType.LOOP,
                        geometry,
                        List.of(),
                        distanceKm,
                        30,
                        0.0, 0.0, null, 0.0, null, null, null,
                        List.of(),
                        com.routecraft.api.routing.model.Difficulty.EASY,
                        new com.routecraft.api.routing.model.RouteMetrics(
                                50, 50, 50, 50, 50, 50, 80, 65),
                        "Test explanation");

        return new GeneratedRouteCandidate(rc, List.of(), List.of(), RouteStrategy.RECOMMENDED);
    }
}
