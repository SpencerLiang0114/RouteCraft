package com.routecraft.api.routing.generator;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import com.routecraft.api.routing.graph.GeoUtils;
import com.routecraft.api.routing.graph.RouteEdge;
import com.routecraft.api.routing.model.LatLng;

public final class RouteDiversity {

    private RouteDiversity() {
    }

    /**
     * Filters a ranked list of candidates to keep at most one per cluster of similar routes.
     *
     * <p>Two routes are considered too similar if either:
     * <ul>
     *   <li>their edge-ID overlap ratio exceeds {@code maxEdgeOverlap}, <em>or</em></li>
     *   <li>their geometry centroids are within {@code centroidThresholdKm} of each other
     *       (catches spatial twins that share 0 % of OSM edge IDs).</li>
     * </ul>
     *
     * @param routes               candidates ordered from best to worst
     * @param maxEdgeOverlap       maximum allowed edge-distance overlap ratio (0–1)
     * @param centroidThresholdKm  maximum centroid distance to treat as a spatial duplicate
     */
    public static List<GeneratedRouteCandidate> filterDiverseRoutes(
            List<GeneratedRouteCandidate> routes,
            double maxEdgeOverlap,
            double centroidThresholdKm) {
        List<GeneratedRouteCandidate> kept = new ArrayList<>();
        for (GeneratedRouteCandidate route : routes) {
            boolean overlaps = false;
            for (GeneratedRouteCandidate keptRoute : kept) {
                if (edgeOverlap(route, keptRoute) > maxEdgeOverlap) {
                    overlaps = true;
                    break;
                }
                if (centroidDistance(route, keptRoute) < centroidThresholdKm) {
                    overlaps = true;
                    break;
                }
            }
            if (!overlaps) {
                kept.add(route);
            }
        }
        return kept;
    }

    /**
     * Convenience overload that applies only the edge-overlap check (for callers that cannot
     * supply a centroid threshold).
     */
    public static List<GeneratedRouteCandidate> filterDiverseRoutes(
            List<GeneratedRouteCandidate> routes,
            double maxEdgeOverlap) {
        // Use a very small centroid threshold so it rarely triggers on its own —
        // the edge-overlap check remains the primary filter.
        return filterDiverseRoutes(routes, maxEdgeOverlap, 0.05);
    }

    // ------------------------------------------------------------------
    // Overlap metrics
    // ------------------------------------------------------------------

    private static double edgeOverlap(GeneratedRouteCandidate a, GeneratedRouteCandidate b) {
        Set<String> idsA = new HashSet<>(a.edgeIds());
        Set<String> idsB = new HashSet<>(b.edgeIds());
        Set<String> shared = new HashSet<>(idsA);
        shared.retainAll(idsB);
        double sharedDistance = 0;
        for (String edgeId : shared) {
            sharedDistance += Math.min(distanceByEdge(a, edgeId), distanceByEdge(b, edgeId));
        }
        double shorterDistance = Math.min(a.candidate().distanceKm(), b.candidate().distanceKm()) * 1000;
        return shorterDistance > 0 ? sharedDistance / shorterDistance : 0;
    }

    private static double distanceByEdge(GeneratedRouteCandidate route, String edgeKey) {
        double total = 0;
        for (RouteEdge edge : route.edges()) {
            if (edge.undirectedKey().equals(edgeKey)) {
                total += edge.distanceM();
            }
        }
        return total;
    }

    /**
     * Haversine distance between the geographic centroids of two routes' geometry.
     * The centroid is approximated as the mean of all geometry coordinates.
     */
    private static double centroidDistance(GeneratedRouteCandidate a, GeneratedRouteCandidate b) {
        LatLng ca = centroid(a.candidate().geometry());
        LatLng cb = centroid(b.candidate().geometry());
        if (ca == null || cb == null) return Double.MAX_VALUE;
        return GeoUtils.haversineDistanceKm(ca, cb);
    }

    private static LatLng centroid(List<LatLng> geometry) {
        if (geometry == null || geometry.isEmpty()) return null;
        double sumLat = 0, sumLng = 0;
        for (LatLng p : geometry) {
            sumLat += p.lat();
            sumLng += p.lng();
        }
        return new LatLng(sumLat / geometry.size(), sumLng / geometry.size());
    }

    // ------------------------------------------------------------------
    // Public geometry utilities
    // ------------------------------------------------------------------

    /**
     * Geometry-based overlap for routes that don't carry edge metadata. Used when comparing
     * public-facing RouteCandidate values where the internal edge list isn't available.
     */
    public static double geometryOverlap(List<LatLng> geometryA, List<LatLng> geometryB) {
        Set<String> segmentsA = geometrySegmentKeys(geometryA);
        Set<String> segmentsB = geometrySegmentKeys(geometryB);
        Set<String> shared = new HashSet<>(segmentsA);
        shared.retainAll(segmentsB);
        int denominator = Math.min(segmentsA.size(), segmentsB.size());
        if (denominator == 0) {
            if (geometryA.isEmpty() || geometryB.isEmpty()) return 0;
            return GeoUtils.distanceM(geometryA.get(0), geometryB.get(0)) < 20 ? 1 : 0;
        }
        double distA = GeoUtils.calculateGeometryDistanceM(geometryA);
        double distB = GeoUtils.calculateGeometryDistanceM(geometryB);
        double ratio = Math.min(distA, distB) / Math.max(Math.max(distA, distB), 1);
        return ((double) shared.size() / denominator) * ratio;
    }

    private static Set<String> geometrySegmentKeys(List<LatLng> geometry) {
        Set<String> keys = new HashSet<>();
        for (int i = 1; i < geometry.size(); i++) {
            LatLng prev = geometry.get(i - 1);
            LatLng curr = geometry.get(i);
            String first = String.format("%.4f,%.4f", prev.lat(), prev.lng());
            String second = String.format("%.4f,%.4f", curr.lat(), curr.lng());
            keys.add(first.compareTo(second) <= 0 ? first + "<>" + second : second + "<>" + first);
        }
        return keys;
    }
}
