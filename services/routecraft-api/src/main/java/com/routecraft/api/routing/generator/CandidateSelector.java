package com.routecraft.api.routing.generator;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.routecraft.api.routing.graph.GeoUtils;
import com.routecraft.api.routing.graph.Pathfinding;
import com.routecraft.api.routing.graph.RouteEdge;
import com.routecraft.api.routing.graph.RouteGraph;
import com.routecraft.api.routing.graph.RouteNode;
import com.routecraft.api.routing.model.ActivityType;
import com.routecraft.api.routing.model.LatLng;
import com.routecraft.api.routing.model.RouteCandidate;
import com.routecraft.api.routing.model.UserPreferences;

public final class CandidateSelector {

    public static final LatLng FALLBACK_START = new LatLng(40.0149, -105.2705);

    /** Minimum angular separation (degrees) between two waypoints around the start to avoid
     *  degenerate near-collinear triangles. */
    private static final double MIN_WAYPOINT_ANGLE_DEG = 25.0;

    /** Number of directional sectors used for quadrant-based anchor selection. */
    private static final int SECTOR_COUNT = 8;

    /** Max candidates to evaluate per sector. */
    private static final int TOP_NODES_PER_SECTOR = 4;

    private CandidateSelector() {
    }

    public static RouteNode getStartNode(RouteGraph graph, UserPreferences preferences) {
        LatLng startPoint = preferences.startPoint() != null ? preferences.startPoint() : FALLBACK_START;
        RouteNode start = graph.findNearestNode(startPoint);
        if (start == null) {
            throw new IllegalStateException("No routable start node found near the selected start point.");
        }
        return start;
    }

    public static List<RouteCandidate> filterByDistance(List<RouteCandidate> routes, Double targetDistanceKm) {
        if (targetDistanceKm == null || targetDistanceKm <= 0) {
            return routes;
        }
        double tolerance = GeoUtils.distanceToleranceRatio(targetDistanceKm);
        List<RouteCandidate> result = new ArrayList<>();
        for (RouteCandidate route : routes) {
            double miss = Math.abs(route.distanceKm() - targetDistanceKm) / targetDistanceKm;
            if (miss <= tolerance) {
                result.add(route);
            }
        }
        return result;
    }

    public static List<GeneratedRouteCandidate> filterGeneratedByDistance(
            List<GeneratedRouteCandidate> routes,
            Double targetDistanceKm) {
        if (targetDistanceKm == null || targetDistanceKm <= 0) {
            return routes;
        }
        double tolerance = GeoUtils.distanceToleranceRatio(targetDistanceKm);
        List<GeneratedRouteCandidate> result = new ArrayList<>();
        for (GeneratedRouteCandidate route : routes) {
            double miss = Math.abs(route.candidate().distanceKm() - targetDistanceKm) / targetDistanceKm;
            if (miss <= tolerance) {
                result.add(route);
            }
        }
        return result;
    }

    public static List<GeneratedRouteCandidate> rankRoutes(List<GeneratedRouteCandidate> routes) {
        List<GeneratedRouteCandidate> sorted = new ArrayList<>(routes);
        sorted.sort((a, b) -> {
            double bs = b.candidate().metrics().totalScore();
            double as = a.candidate().metrics().totalScore();
            if (bs != as) {
                return Double.compare(bs, as);
            }
            // Secondary: prefer closer distance match
            double adist = b.candidate().metrics().distanceScore();
            double bdist = a.candidate().metrics().distanceScore();
            if (adist != bdist) {
                return Double.compare(adist, bdist);
            }
            return Double.compare(
                    Math.abs(a.candidate().elevationGainM()),
                    Math.abs(b.candidate().elevationGainM()));
        });
        return sorted;
    }

    // -------------------------------------------------------------------------
    // Waypoint-set generation — quadrant-based anchor selection
    // -------------------------------------------------------------------------

    /**
     * Generates loop waypoint sets using quadrant-based anchor discovery.
     *
     * <p>The graph is partitioned into {@value #SECTOR_COUNT} directional sectors around the
     * start. The top-quality nodes per sector are collected and assembled into 2- and 3-waypoint
     * sets using equilateral-triangle (120°) and semicircular (180°) geometric patterns.
     *
     * <p>Sets where the waypoints form a degenerate (near-collinear) triangle are skipped before
     * any pathfinding is attempted.
     */
    public static List<WaypointSet> generateLoopWaypointSets(
            UserPreferences preferences,
            RouteGraph graph,
            RouteNode startNode) {
        double targetDistanceM = GeoUtils.resolveTargetDistanceKm(preferences) * 1000;

        // Radius band: we search for anchors within [minR, maxR] from start.
        // For a loop the straight-line radius ≈ perimeter / (2π) for a circle,
        // but real road loops have a winding factor of ~1.3–1.6, so radius ≈ D / 5.5.
        double baseRadiusM = Math.max(400, targetDistanceM / 5.2);

        // Collect the best routable nodes per compass sector
        List<List<RouteNode>> sectorNodes = collectSectorNodes(graph, startNode, preferences, baseRadiusM);

        List<WaypointSet> sets = new ArrayList<>();

        // --- 2-waypoint sets (semicircular — anchors ~180° apart) ---
        addSemicircularSets(sets, sectorNodes, startNode, graph, preferences, baseRadiusM);

        // --- 2-waypoint sets (wide — anchors ~120° apart) ---
        addWideSets(sets, sectorNodes, startNode, graph, preferences, baseRadiusM);

        // --- 3-waypoint equilateral sets (anchors ~120° apart) ---
        addEquilateralSets(sets, sectorNodes, startNode, graph, preferences, baseRadiusM);

        // Fallback: if we collected too few sets, supplement with a simple bearing grid
        if (sets.size() < 6) {
            addFallbackBearingSets(sets, graph, startNode, preferences, baseRadiusM);
        }

        return sets;
    }

    /**
     * Partitions all graph nodes into {@value #SECTOR_COUNT} directional sectors around the
     * start point, keeping only nodes within a reasonable radius band and returning the
     * top-quality nodes per sector.
     *
     * <p>Time complexity: O(V) for the scan + O(S × B log B) for bucket sorts,
     * where S = SECTOR_COUNT and B = bucket size.
     * Space complexity: O(V) for bucket storage.
     */
    private static List<List<RouteNode>> collectSectorNodes(
            RouteGraph graph,
            RouteNode startNode,
            UserPreferences preferences,
            double baseRadiusM) {

        double minRadiusM = baseRadiusM * 0.55;
        double maxRadiusM = baseRadiusM * 1.55;

        // Each sector bucket: list of (node, quality, distError)
        @SuppressWarnings("unchecked")
        List<NodeQuality>[] buckets = new List[SECTOR_COUNT];
        for (int i = 0; i < SECTOR_COUNT; i++) {
            buckets[i] = new ArrayList<>();
        }

        double sectorWidth = 360.0 / SECTOR_COUNT;

        for (RouteNode node : graph.nodeValues()) {
            if (node.id().equals(startNode.id())) continue;
            if (graph.adjacent(node.id()).size() < 2) continue;

            double distM = GeoUtils.distanceM(startNode.point(), node.point());
            if (distM < minRadiusM || distM > maxRadiusM) continue;

            double bearing = GeoUtils.bearingDegrees(startNode.point(), node.point());
            int sector = (int) (bearing / sectorWidth) % SECTOR_COUNT;

            double quality = routeQualityNearNode(graph, node.id(), preferences);
            // Prefer nodes close to the ideal radius (minimise radial error)
            double radialError = Math.abs(distM - baseRadiusM) / baseRadiusM;
            double compositeScore = quality - radialError * 0.4;

            buckets[sector].add(new NodeQuality(node, compositeScore));
        }

        List<List<RouteNode>> result = new ArrayList<>(SECTOR_COUNT);
        for (int i = 0; i < SECTOR_COUNT; i++) {
            List<NodeQuality> bucket = buckets[i];
            bucket.sort(Comparator.comparingDouble((NodeQuality nq) -> nq.score).reversed());
            List<RouteNode> top = new ArrayList<>();
            for (int j = 0; j < Math.min(TOP_NODES_PER_SECTOR, bucket.size()); j++) {
                top.add(bucket.get(j).node);
            }
            result.add(top);
        }
        return result;
    }


    /**
     * Adds 2-waypoint sets where the two anchors are approximately opposite each other
     * (semicircular pattern — ~4 sectors apart, 180°).
     */
    private static void addSemicircularSets(
            List<WaypointSet> sets,
            List<List<RouteNode>> sectorNodes,
            RouteNode startNode,
            RouteGraph graph,
            UserPreferences preferences,
            double baseRadiusM) {
        int half = SECTOR_COUNT / 2;
        for (int i = 0; i < half; i++) {
            int opposite = (i + half) % SECTOR_COUNT;
            for (RouteNode first : sectorNodes.get(i)) {
                for (RouteNode second : sectorNodes.get(opposite)) {
                    if (first.id().equals(second.id())) continue;
                    if (!isNonDegenerate(startNode.point(), first.point(), second.point())) continue;
                    RouteStrategy strategy = (i % 2 == 0) ? RouteStrategy.RECOMMENDED : RouteStrategy.EXPLORATION;
                    sets.add(new WaypointSet(List.of(first.id(), second.id()), strategy));
                }
            }
        }
    }

    /**
     * Adds 2-waypoint sets where the two anchors are ~120° apart (wide-loop pattern).
     */
    private static void addWideSets(
            List<WaypointSet> sets,
            List<List<RouteNode>> sectorNodes,
            RouteNode startNode,
            RouteGraph graph,
            UserPreferences preferences,
            double baseRadiusM) {
        // 120° apart ≈ SECTOR_COUNT/3 sectors apart
        int step = Math.max(2, SECTOR_COUNT / 3);
        for (int i = 0; i < SECTOR_COUNT; i++) {
            int j = (i + step) % SECTOR_COUNT;
            for (RouteNode first : sectorNodes.get(i)) {
                for (RouteNode second : sectorNodes.get(j)) {
                    if (first.id().equals(second.id())) continue;
                    if (!isNonDegenerate(startNode.point(), first.point(), second.point())) continue;
                    sets.add(new WaypointSet(List.of(first.id(), second.id()), RouteStrategy.EXPLORATION));
                }
            }
        }
    }

    /**
     * Adds 3-waypoint equilateral sets where anchors are spaced ~120° apart.
     */
    private static void addEquilateralSets(
            List<WaypointSet> sets,
            List<List<RouteNode>> sectorNodes,
            RouteNode startNode,
            RouteGraph graph,
            UserPreferences preferences,
            double baseRadiusM) {
        int step = Math.max(2, SECTOR_COUNT / 3);
        for (int i = 0; i < SECTOR_COUNT; i++) {
            int j = (i + step) % SECTOR_COUNT;
            int k = (i + 2 * step) % SECTOR_COUNT;
            List<RouteNode> si = sectorNodes.get(i);
            List<RouteNode> sj = sectorNodes.get(j);
            List<RouteNode> sk = sectorNodes.get(k);
            if (si.isEmpty() || sj.isEmpty() || sk.isEmpty()) continue;

            // Take the best node from each of the three sectors
            RouteNode first = si.get(0);
            RouteNode second = sj.get(0);
            RouteNode third = sk.get(0);

            if (first.id().equals(second.id()) || first.id().equals(third.id())
                    || second.id().equals(third.id())) continue;

            if (!isNonDegenerate(startNode.point(), first.point(), second.point())) continue;
            if (!isNonDegenerate(startNode.point(), first.point(), third.point())) continue;
            if (!isNonDegenerate(second.point(), first.point(), third.point())) continue;

            // Also try mixing the 2nd-best alternatives for diversity
            sets.add(new WaypointSet(List.of(first.id(), second.id(), third.id()), RouteStrategy.PARK));

            if (si.size() > 1) {
                RouteNode alt = si.get(1);
                if (!alt.id().equals(second.id()) && !alt.id().equals(third.id())
                        && isNonDegenerate(startNode.point(), alt.point(), second.point())
                        && isNonDegenerate(startNode.point(), alt.point(), third.point())) {
                    sets.add(new WaypointSet(List.of(alt.id(), second.id(), third.id()), RouteStrategy.PARK));
                }
            }
        }
    }

    /**
     * Fallback: simple 8-bearing × 3-radius grid, used when quadrant discovery yields too few sets.
     * This mirrors the old algorithm but with the improved radius cap on {@link #pickBestNodeNear}.
     */
    private static void addFallbackBearingSets(
            List<WaypointSet> sets,
            RouteGraph graph,
            RouteNode startNode,
            UserPreferences preferences,
            double baseRadiusM) {
        double[] bearings = {0, 45, 90, 135, 180, 225, 270, 315};
        double[] radiiScale = {0.85, 1.0, 1.15};
        for (double radiusM : radiiScale) {
            double r = baseRadiusM * radiusM;
            for (double bearing : bearings) {
                Set<String> excluded = new HashSet<>();
                excluded.add(startNode.id());
                RouteNode first = pickBestNodeNear(graph,
                        GeoUtils.destinationPoint(startNode.point(), bearing, r * 0.90),
                        r * 0.35, preferences, excluded);
                if (first == null) continue;
                excluded.add(first.id());
                RouteNode second = pickBestNodeNear(graph,
                        GeoUtils.destinationPoint(startNode.point(), (bearing + 120) % 360, r),
                        r * 0.35, preferences, excluded);
                if (second == null) continue;
                if (!isNonDegenerate(startNode.point(), first.point(), second.point())) continue;
                sets.add(new WaypointSet(List.of(first.id(), second.id()), RouteStrategy.RECOMMENDED));
            }
        }
    }

    // -------------------------------------------------------------------------
    // Node picking helpers
    // -------------------------------------------------------------------------

    /**
     * Picks the best routable node near {@code point} within a hard search radius of
     * {@code searchRadiusM}. Ranking is by route quality only — not quality minus distance — so a
     * far-but-high-quality attractor cannot pull the waypoint away from its intended position.
     *
     * <p>Uses the KD-tree ring query to restrict the candidate set to nodes within the search
     * radius, avoiding an O(V) full-graph scan.
     *
     * <p>Time complexity: O(log V + hits) where hits = nodes within {@code searchRadiusM}.
     */
    static RouteNode pickBestNodeNear(
            RouteGraph graph,
            LatLng point,
            double searchRadiusM,
            UserPreferences preferences,
            Set<String> excluded) {
        RouteNode best = null;
        double bestScore = Double.NEGATIVE_INFINITY;
        // Use KD-tree ring query: centre on midpoint, ring radius = searchRadiusM/2,
        // tolerance = searchRadiusM/2. This covers the full disk [0, searchRadiusM].
        List<com.routecraft.api.routing.graph.KdTree.RangeHit> hits =
                graph.findNodesInRing(point, searchRadiusM / 2.0, searchRadiusM / 2.0 + 1);
        for (com.routecraft.api.routing.graph.KdTree.RangeHit hit : hits) {
            RouteNode node = hit.node();
            if (excluded.contains(node.id())) continue;
            if (graph.adjacent(node.id()).size() < 2) continue;
            double distM = hit.distanceM();
            if (distM > searchRadiusM) continue;
            // Within the cap, rank purely by quality (small proximity bonus to break ties)
            double score = routeQualityNearNode(graph, node.id(), preferences)
                    - distM / searchRadiusM * 0.1;
            if (score > bestScore) {
                bestScore = score;
                best = node;
            }
        }
        return best;
    }


    // -------------------------------------------------------------------------
    // Geometry helpers
    // -------------------------------------------------------------------------

    /**
     * Returns {@code true} when the three points form a non-degenerate loop triangle,
     * i.e. the bearing from {@code pivot} to each of {@code a} and {@code b} differs by at least
     * {@value #MIN_WAYPOINT_ANGLE_DEG} degrees. Degenerate sets (collinear or near-collinear)
     * would produce disguised out-and-back routes.
     */
    static boolean isNonDegenerate(LatLng pivot, LatLng a, LatLng b) {
        double bearingA = GeoUtils.bearingDegrees(pivot, a);
        double bearingB = GeoUtils.bearingDegrees(pivot, b);
        return GeoUtils.angularDifference(bearingA, bearingB) >= MIN_WAYPOINT_ANGLE_DEG;
    }

    // -------------------------------------------------------------------------
    // Quality scoring
    // -------------------------------------------------------------------------

    static double routeQualityNearNode(RouteGraph graph, String nodeId, UserPreferences preferences) {
        List<RouteEdge> edges = graph.adjacent(nodeId);
        if (edges.isEmpty()) {
            return 0;
        }
        double parkPreference = GeoUtils.normalizePreference(preferences.parkPreference());
        double shadePreference = GeoUtils.normalizePreference(preferences.shadePreference());
        double safetyPreference = GeoUtils.normalizePreference(preferences.safetyPreference());
        double explorationPreference = GeoUtils.normalizePreference(preferences.explorationPreference());

        double total = 0;
        for (RouteEdge edge : edges) {
            if (!edge.accessAllowed()) {
                total -= 3;
                continue;
            }
            double novelty = edge.noveltyScore() == null ? edge.sceneryScore() : edge.noveltyScore();
            total += edge.parkScore() * parkPreference
                    + edge.shadeScore() * shadePreference
                    + edge.safetyScore() * safetyPreference
                    + novelty * explorationPreference
                    + edge.sceneryScore() * 0.4
                    + (preferences.activity() == ActivityType.CYCLING ? edge.bikeScore() : edge.walkScore());
        }
        return total / edges.size();
    }

    // -------------------------------------------------------------------------
    // Out-and-back destination selection (unchanged)
    // -------------------------------------------------------------------------

    public static List<RouteNode> findOutAndBackDestinations(
            UserPreferences preferences,
            RouteGraph graph,
            RouteNode startNode) {
        double targetOutboundM = (GeoUtils.resolveTargetDistanceKm(preferences) * 1000) / 2;
        Map<String, Double> roadDistances = Pathfinding.singleSourceShortestDistances(graph, startNode.id());
        double hardCapM = Math.max(400, targetOutboundM * 0.25);

        List<Candidate> candidates = new ArrayList<>();
        gatherDestinations(graph, startNode, preferences, roadDistances, targetOutboundM, hardCapM, candidates);

        if (candidates.size() < 5) {
            double relaxedCapM = Math.max(800, targetOutboundM * 0.5);
            gatherRelaxedDestinations(graph, startNode, preferences, roadDistances, targetOutboundM,
                    hardCapM, relaxedCapM, candidates);
        }

        candidates.sort((a, b) -> {
            if (Math.abs(a.distanceErrorM - b.distanceErrorM) < 150) {
                return Double.compare(b.score, a.score);
            }
            return Double.compare(a.distanceErrorM, b.distanceErrorM);
        });
        List<RouteNode> result = new ArrayList<>();
        for (int i = 0; i < Math.min(30, candidates.size()); i++) {
            result.add(candidates.get(i).node);
        }
        return result;
    }

    private static void gatherDestinations(
            RouteGraph graph,
            RouteNode startNode,
            UserPreferences preferences,
            Map<String, Double> roadDistances,
            double targetOutboundM,
            double hardCapM,
            List<Candidate> candidates) {
        for (Map.Entry<String, Double> entry : roadDistances.entrySet()) {
            String nodeId = entry.getKey();
            if (nodeId.equals(startNode.id())) continue;
            RouteNode node = graph.nodes().get(nodeId);
            if (node == null) continue;
            if (graph.adjacent(nodeId).size() < 2) continue;
            double distanceErrorM = Math.abs(entry.getValue() - targetOutboundM);
            if (distanceErrorM > hardCapM) continue;
            double bearing = GeoUtils.bearingDegrees(startNode.point(), node.point());
            double distanceScore = 1 - distanceErrorM / hardCapM;
            double quality = routeQualityNearNode(graph, nodeId, preferences);
            double explorationBias = GeoUtils.normalizePreference(preferences.explorationPreference())
                    * GeoUtils.angularDifference(bearing, 45) * -0.004;
            double score = distanceScore * 3 + quality + explorationBias;
            candidates.add(new Candidate(node, score, distanceErrorM));
        }
    }

    private static void gatherRelaxedDestinations(
            RouteGraph graph,
            RouteNode startNode,
            UserPreferences preferences,
            Map<String, Double> roadDistances,
            double targetOutboundM,
            double hardCapM,
            double relaxedCapM,
            List<Candidate> candidates) {
        for (Map.Entry<String, Double> entry : roadDistances.entrySet()) {
            String nodeId = entry.getKey();
            if (nodeId.equals(startNode.id())) continue;
            RouteNode node = graph.nodes().get(nodeId);
            if (node == null) continue;
            if (graph.adjacent(nodeId).size() < 2) continue;
            double distanceErrorM = Math.abs(entry.getValue() - targetOutboundM);
            if (distanceErrorM <= hardCapM || distanceErrorM > relaxedCapM) continue;
            double bearing = GeoUtils.bearingDegrees(startNode.point(), node.point());
            double distanceScore = 1 - distanceErrorM / relaxedCapM;
            double quality = routeQualityNearNode(graph, nodeId, preferences);
            double explorationBias = GeoUtils.normalizePreference(preferences.explorationPreference())
                    * GeoUtils.angularDifference(bearing, 45) * -0.004;
            double score = distanceScore * 3 + quality + explorationBias;
            candidates.add(new Candidate(node, score, distanceErrorM));
        }
    }

    // -------------------------------------------------------------------------
    // Internal data types
    // -------------------------------------------------------------------------

    public record WaypointSet(List<String> nodeIds, RouteStrategy strategy) {
        public WaypointSet {
            nodeIds = List.copyOf(nodeIds);
        }
    }

    private record Candidate(RouteNode node, double score, double distanceErrorM) {
    }

    private record NodeQuality(RouteNode node, double score) {
    }
}
