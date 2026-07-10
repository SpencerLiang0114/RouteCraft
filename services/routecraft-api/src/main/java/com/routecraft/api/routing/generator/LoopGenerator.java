package com.routecraft.api.routing.generator;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import com.routecraft.api.routing.graph.EdgeCost;
import com.routecraft.api.routing.graph.GeoUtils;
import com.routecraft.api.routing.graph.PathOptions;
import com.routecraft.api.routing.graph.PathResult;
import com.routecraft.api.routing.graph.Pathfinding;
import com.routecraft.api.routing.graph.RouteEdge;
import com.routecraft.api.routing.graph.RouteGraph;
import com.routecraft.api.routing.graph.RouteNode;
import com.routecraft.api.routing.model.ActivityType;
import com.routecraft.api.routing.model.LatLng;
import com.routecraft.api.routing.model.RouteCandidate;
import com.routecraft.api.routing.model.RouteMetrics;
import com.routecraft.api.routing.model.RouteType;
import com.routecraft.api.routing.model.RouteStyle;
import com.routecraft.api.routing.model.UserPreferences;

public final class LoopGenerator {

    // ------------------------------------------------------------------
    // Tunable constants
    // ------------------------------------------------------------------

    /**
     * Additive penalty per metre of edge distance applied to edges that have already been
     * traversed in a previous leg. Stored per undirectedKey; accumulated across legs.
     * Applied as: nextCost = cost + penalty (additive in Pathfinding).
     * At 5.0 m⁻¹ a repeated 200 m edge costs an extra 1 000 m equivalent — significant but not
     * pathologically large for Dijkstra.
     */
    private static final double PENALTY_PER_METRE = 5.0;

    /**
     * Additional penalty multiplier applied to the closing segment.  The closing segment must
     * find a fresh return path; double-penalise previously used edges.
     */
    private static final double CLOSING_PENALTY_MULTIPLIER = 2.0;

    /**
     * Spatial corridor half-width (metres).  Nodes whose nearest geometry point on the outbound
     * path lies within this distance will receive an extra penalty during closing-segment routing.
     * This prevents the return path from hugging the outbound path spatially even via different
     * edge IDs.
     */
    private static final double SPATIAL_CORRIDOR_M = 45.0;

    /**
     * Extra penalty per metre applied to nodes inside the spatial corridor.  Scaled by
     * {@link #PENALTY_PER_METRE} so the scale is consistent.
     */
    private static final double SPATIAL_NODE_PENALTY = PENALTY_PER_METRE * 3.0;

    /** Self-overlap limits — proportion of route distance that may re-use the same edges. */
    private static final double STRICT_OVERLAP_LIMIT = 0.05;
    private static final double LOOSE_OVERLAP_LIMIT  = 0.15;

    /** Minimum isoperimetric quotient (≈ 4π·area / perimeter²). */
    private static final double MIN_LOOP_COMPACTNESS = 0.025;

    /** Maximum fraction of edge-pairs where the heading reverses ≥ 155°. */
    private static final double MAX_BACKTRACK_RATIO = 0.18;
    private static final double MAX_BACKTRACK_RATIO_HIKING = 0.28; // hiking ridgelines are ok

    /** Maximum detour factor (road distance / straight-line distance) for any single leg. */
    private static final double MAX_LEG_DETOUR_RATIO = 2.8;

    /** Maximum fraction of short steep edges for non-climbing routes. */
    private static final double MAX_STEEP_SPIKE_RATIO = 0.16;

    /** Evaluate the two highest-quality anchor tiers before considering broader fallbacks. */
    private static final int INITIAL_WAYPOINT_TIER = 2;

    /** A robust early pool must survive both distance and spatial-diversity checks. */
    private static final int MIN_TARGET_MATCHES_FOR_EARLY_STOP = 8;
    private static final int MIN_DIVERSE_ROUTES_FOR_EARLY_STOP = 3;

    private LoopGenerator() {
    }

    // ------------------------------------------------------------------
    // Entry point
    // ------------------------------------------------------------------

    public static List<GeneratedRouteCandidate> generate(UserPreferences preferences, RouteGraph graph) {
        RouteNode startNode = CandidateSelector.getStartNode(graph, preferences);
        List<CandidateSelector.WaypointSet> waypointSets =
                CandidateSelector.generateLoopWaypointSets(preferences, graph, startNode);

        List<Built> built = new ArrayList<>();
        EdgeCost.PreferenceCache prefCache = EdgeCost.PreferenceCache.of(preferences);
        Map<String, Optional<PathResult>> firstLegCache = new HashMap<>();
        Map<String, Map<String, Double>> corridorPenaltyCache = new HashMap<>();
        int currentTier = waypointSets.isEmpty() ? 0 : waypointSets.get(0).tier();

        for (int index = 0; index < waypointSets.size(); index++) {
            CandidateSelector.WaypointSet set = waypointSets.get(index);
            if (set.tier() > currentTier) {
                if (currentTier >= INITIAL_WAYPOINT_TIER
                        && hasSufficientLoopPool(built, preferences)) {
                    break;
                }
                currentTier = set.tier();
            }
            List<String> nodeIds = new ArrayList<>();
            nodeIds.add(startNode.id());
            nodeIds.addAll(set.nodeIds());
            nodeIds.add(startNode.id());

            List<PathResult> segments = new ArrayList<>();
            List<Double> legDetourRatios = new ArrayList<>();
            // Penalty map: undirectedKey → accumulated additive penalty (pre-scaled by edge distance)
            Map<String, Double> edgePenalties = new HashMap<>();
            boolean failed = false;

            for (int step = 0; step < nodeIds.size() - 1; step++) {
                boolean isClosingSegment = step == nodeIds.size() - 2;

                Map<String, Double> segmentPenalties;
                if (isClosingSegment) {
                    // For the closing segment: double the edge penalties and add spatial corridor
                    Map<String, Double> corridorPenalties = corridorPenaltyCache.computeIfAbsent(
                            nodeIds.get(1),
                            ignored -> buildCorridorPenalties(graph, segments.get(0)));
                    segmentPenalties = buildClosingPenalties(edgePenalties, corridorPenalties);
                } else {
                    segmentPenalties = edgePenalties;
                }

                Optional<PathResult> segment;
                if (step == 0) {
                    String firstWaypointId = nodeIds.get(1);
                    segment = firstLegCache.computeIfAbsent(
                            firstWaypointId,
                            ignored -> Pathfinding.findShortestPath(
                                    graph,
                                    startNode.id(),
                                    firstWaypointId,
                                    prefCache,
                                    PathOptions.empty()));
                } else {
                    segment = Pathfinding.findShortestPath(
                            graph,
                            nodeIds.get(step),
                            nodeIds.get(step + 1),
                            prefCache,
                            new PathOptions(null, null, segmentPenalties));
                }
                if (segment.isEmpty()) {
                    failed = true;
                    break;
                }
                segments.add(segment.get());

                double directDistanceM = GeoUtils.distanceM(
                        graph.nodes().get(nodeIds.get(step)).point(),
                        graph.nodes().get(nodeIds.get(step + 1)).point());
                double legDetourRatio = directDistanceM > 40
                        ? segment.get().distanceM() / directDistanceM : 1;
                if (legDetourRatio > MAX_LEG_DETOUR_RATIO) {
                    failed = true;
                    break;
                }
                legDetourRatios.add(legDetourRatio);

                // Accumulate additive penalties (scaled by edge distance) for subsequent legs
                for (RouteEdge edge : segment.get().edges()) {
                    String key = edge.undirectedKey();
                    edgePenalties.put(key,
                            edgePenalties.getOrDefault(key, 0.0) + PENALTY_PER_METRE * edge.distanceM());
                }
            }

            if (failed) continue;

            PathResult combined = Pathfinding.combinePaths(graph, segments);
            PathResult path = Pathfinding.despikePath(graph, combined);
            if (path.edges().isEmpty()) continue;

            LoopShape shape = evaluateLoopShape(graph, path, startNode.point(), legDetourRatios, preferences);
            if (!isRealLoopShape(shape, preferences)) continue;

            List<LatLng> waypoints = new ArrayList<>();
            for (String id : set.nodeIds()) {
                waypoints.add(graph.nodes().get(id).point());
            }

            String name = deriveLoopName(shape, set.strategy(), set.nodeIds().size());
            RouteDraft draft = new RouteDraft(
                    "generated-loop-" + (index + 1),
                    name,
                    preferences.activity(),
                    RouteType.LOOP,
                    path,
                    waypoints,
                    set.strategy(),
                    null);
            GeneratedRouteCandidate candidate = RouteAnalyzer.buildRouteCandidate(draft, preferences);
            candidate = withShapeAdjustedScore(candidate, shape);
            built.add(new Built(candidate, shape));
        }

        // Filter: prefer strict overlap, then the full set of valid loops.
        List<Built> strict = built.stream()
                .filter(b -> b.shape().overlapRatio <= STRICT_OVERLAP_LIMIT)
                .toList();
        if (strict.size() >= 3) {
            return strict.stream().map(Built::candidate).toList();
        }

        return built.stream().map(Built::candidate).toList();
    }

    private static boolean hasSufficientLoopPool(
            List<Built> built,
            UserPreferences preferences) {
        double targetDistanceKm = GeoUtils.resolveTargetDistanceKm(preferences);
        double tolerance = GeoUtils.distanceToleranceRatio(targetDistanceKm);
        List<GeneratedRouteCandidate> targetMatches = built.stream()
                .filter(b -> b.shape().overlapRatio <= STRICT_OVERLAP_LIMIT)
                .map(Built::candidate)
                .filter(candidate -> Math.abs(
                        candidate.candidate().distanceKm() - targetDistanceKm) / targetDistanceKm <= tolerance)
                .toList();
        if (targetMatches.size() < MIN_TARGET_MATCHES_FOR_EARLY_STOP) {
            return false;
        }

        List<GeneratedRouteCandidate> ranked = CandidateSelector.rankRoutes(targetMatches);
        List<GeneratedRouteCandidate> diverse = RouteDiversity.filterDiverseRoutes(
                ranked,
                0.65,
                targetDistanceKm * 0.10,
                MIN_DIVERSE_ROUTES_FOR_EARLY_STOP);
        return diverse.size() >= MIN_DIVERSE_ROUTES_FOR_EARLY_STOP;
    }

    private record Built(GeneratedRouteCandidate candidate, LoopShape shape) {
    }

    // ------------------------------------------------------------------
    // Closing-segment penalty construction
    // ------------------------------------------------------------------

    /**
     * Builds the penalty map for the closing segment.
     *
     * <p>Two kinds of penalty are applied:
     * <ol>
     *   <li><b>Edge penalty</b>: previously traversed edges are penalised at
     *       {@link #CLOSING_PENALTY_MULTIPLIER} × the accumulated value.</li>
     *   <li><b>Spatial corridor penalty</b>: edges whose endpoints lie within
     *       {@link #SPATIAL_CORRIDOR_M} metres of the outbound path receive an additional
     *       penalty.  Only the first 40 % of the combined path is considered the
     *       "outbound corridor" to avoid penalising the route close to the start/end.</li>
     * </ol>
     *
     * <p>The spatial corridor component is cached per first waypoint. Repeated waypoint sets
     * therefore only pay O(E_prev + E_corridor) to merge the two penalty maps.
     */
    private static Map<String, Double> buildClosingPenalties(
            Map<String, Double> baseEdgePenalties,
            Map<String, Double> corridorPenalties) {

        Map<String, Double> result = new HashMap<>(baseEdgePenalties.size() + corridorPenalties.size());
        for (Map.Entry<String, Double> e : baseEdgePenalties.entrySet()) {
            result.put(e.getKey(), e.getValue() * CLOSING_PENALTY_MULTIPLIER);
        }
        for (Map.Entry<String, Double> e : corridorPenalties.entrySet()) {
            result.merge(e.getKey(), e.getValue(), Double::sum);
        }
        return result;
    }

    private static Map<String, Double> buildCorridorPenalties(
            RouteGraph graph,
            PathResult outbound) {
        Map<String, Double> result = new HashMap<>();
        List<LatLng> corridor = outbound.geometry();
        if (corridor.size() < 2) {
            return result;
        }
        int corridorEnd = Math.min(corridor.size(), Math.max(2, (int) (corridor.size() * 0.4)));
        List<LatLng> corridorPoints = corridor.subList(0, corridorEnd);

        // Compute a bounding circle for the first ~40 % of the outbound geometry.
        LatLng corridorOrigin = corridorPoints.get(0);
        double corridorSpanM = 0;
        for (LatLng pt : corridorPoints) {
            double d = GeoUtils.distanceM(corridorOrigin, pt);
            if (d > corridorSpanM) corridorSpanM = d;
        }
        double searchRadiusM = corridorSpanM + SPATIAL_CORRIDOR_M;

        List<RouteGraph.RangeHit> nearby =
                graph.findNodesInRing(corridorOrigin, searchRadiusM / 2, searchRadiusM / 2 + 1);
        for (RouteGraph.RangeHit hit : nearby) {
            RouteNode node = hit.node();
            if (isInCorridor(node.point(), corridorPoints)) {
                for (RouteEdge edge : graph.adjacent(node.id())) {
                    String key = edge.undirectedKey();
                    result.merge(key, SPATIAL_NODE_PENALTY * edge.distanceM(), Double::sum);
                }
            }
        }
        return result;
    }


    /** Returns true when {@code point} is within {@link #SPATIAL_CORRIDOR_M} of any corridor segment. */
    private static boolean isInCorridor(LatLng point, List<LatLng> corridor) {
        for (int i = 1; i < corridor.size(); i++) {
            double distKm = GeoUtils.pointToSegmentDistanceKm(point, corridor.get(i - 1), corridor.get(i));
            if (distKm * 1000 < SPATIAL_CORRIDOR_M) {
                return true;
            }
        }
        return false;
    }

    // ------------------------------------------------------------------
    // Score adjustment
    // ------------------------------------------------------------------

    private static GeneratedRouteCandidate withShapeAdjustedScore(
            GeneratedRouteCandidate candidate, LoopShape shape) {
        RouteMetrics m = candidate.candidate().metrics();
        double adjusted = Math.max(0, Math.min(100,
                Math.round(m.totalScore() * 0.75 + shape.score * 0.25)));
        RouteMetrics newMetrics = new RouteMetrics(
                m.parkScore(), m.shadeScore(), m.safetyScore(), m.explorationScore(),
                m.sceneryScore(), m.elevationScore(), m.distanceScore(), adjusted);
        RouteCandidate c = candidate.candidate();
        RouteCandidate replacement = new RouteCandidate(
                c.id(), c.source(), c.name(), c.activity(), c.routeType(),
                c.geometry(), c.waypoints(),
                c.distanceKm(), c.estimatedDurationMin(), c.elevationGainM(),
                c.totalDescentM(), c.averageSlopePct(), c.maxSlopePct(),
                c.lowestElevM(), c.highestElevM(), c.elevDifferenceM(),
                c.elevationProfile(), c.difficulty(), newMetrics, c.explanation());
        return candidate.withCandidate(replacement);
    }

    // ------------------------------------------------------------------
    // Loop shape evaluation
    // ------------------------------------------------------------------

    private record LoopShape(
            double overlapRatio,
            double compactness,
            double bearingCoverage,
            double backtrackRatio,
            int deadEndCount,
            double maxLegDetourRatio,
            double steepSpikeRatio,
            double score) {
    }

    private static LoopShape evaluateLoopShape(
            RouteGraph graph,
            PathResult path,
            LatLng startPoint,
            List<Double> legDetourRatios,
            UserPreferences preferences) {
        double overlapRatio = Pathfinding.pathSelfOverlapRatio(path);
        double compactness = loopCompactness(path);
        double bearingCoverage = bearingCoverage(path, startPoint);
        double backtrackRatio = backtrackRatio(path);
        int deadEndCount = internalDeadEndCount(graph, path);
        double maxLegDetourRatio = 1;
        for (Double r : legDetourRatios) if (r > maxLegDetourRatio) maxLegDetourRatio = r;
        double steepSpikeRatio = steepSpikeRatio(path, preferences);
        double score = loopShapeScore(overlapRatio, compactness, bearingCoverage, backtrackRatio,
                deadEndCount, maxLegDetourRatio, steepSpikeRatio, preferences);
        return new LoopShape(overlapRatio, compactness, bearingCoverage, backtrackRatio,
                deadEndCount, maxLegDetourRatio, steepSpikeRatio, score);
    }

    private static double loopCompactness(PathResult path) {
        List<LatLng> geometry = path.geometry();
        if (geometry.size() < 3 || path.distanceM() <= 0) return 0;
        LatLng origin = geometry.get(0);
        double[][] points = new double[geometry.size()][2];
        for (int i = 0; i < geometry.size(); i++) {
            LatLng p = geometry.get(i);
            points[i][0] = (p.lng() - origin.lng()) * 111320 * Math.cos((origin.lat() * Math.PI) / 180);
            points[i][1] = (p.lat() - origin.lat()) * 110540;
        }
        double doubleArea = 0;
        for (int i = 0; i < points.length; i++) {
            double[] cur = points[i];
            double[] next = points[(i + 1) % points.length];
            doubleArea += cur[0] * next[1] - next[0] * cur[1];
        }
        double areaM2 = Math.abs(doubleArea) / 2;
        return (4 * Math.PI * areaM2) / (path.distanceM() * path.distanceM());
    }

    private static double bearingCoverage(PathResult path, LatLng startPoint) {
        Set<Integer> sectors = new HashSet<>();
        for (LatLng point : path.geometry()) {
            if (GeoUtils.distanceM(startPoint, point) < 120) continue;
            sectors.add((int) Math.floor(GeoUtils.bearingDegrees(startPoint, point) / 45));
        }
        return sectors.size() / 8.0;
    }

    private static double backtrackRatio(PathResult path) {
        if (path.edges().size() < 2) return 0;
        int backtracks = 0;
        for (int i = 1; i < path.edges().size(); i++) {
            List<LatLng> prevGeom = path.edges().get(i - 1).geometry();
            List<LatLng> currGeom = path.edges().get(i).geometry();
            double prevBearing = GeoUtils.bearingDegrees(prevGeom.get(0), prevGeom.get(prevGeom.size() - 1));
            double currBearing = GeoUtils.bearingDegrees(currGeom.get(0), currGeom.get(currGeom.size() - 1));
            if (GeoUtils.angularDifference(prevBearing, currBearing) >= 155) {
                backtracks++;
            }
        }
        return (double) backtracks / (path.edges().size() - 1);
    }

    private static int internalDeadEndCount(RouteGraph graph, PathResult path) {
        if (path.nodeIds().size() < 3) return 0;
        int count = 0;
        for (int i = 1; i < path.nodeIds().size() - 1; i++) {
            int routableDegree = 0;
            for (RouteEdge edge : graph.adjacent(path.nodeIds().get(i))) {
                if (edge.accessAllowed()) routableDegree++;
            }
            if (routableDegree < 2) count++;
        }
        return count;
    }

    private static double steepSpikeRatio(PathResult path, UserPreferences preferences) {
        if (path.distanceM() <= 0 || preferences.routeStyle() == RouteStyle.CLIMBING) return 0;
        double slopeLimit = preferences.activity() == ActivityType.CYCLING ? 0.10 : 0.14;
        double spike = 0;
        for (RouteEdge edge : path.edges()) {
            double slope = Math.abs(edge.slope() == null ? 0 : edge.slope());
            if (slope > slopeLimit && edge.distanceM() <= 700) {
                spike += edge.distanceM();
            }
        }
        return spike / path.distanceM();
    }

    /**
     * Produces a shape score in [0, 100].
     *
     * <p>The scoring starts positive (reward-first) rather than subtracting from 100 with
     * potential for very large penalties that compress the useful range.  Bearing coverage is
     * weighted higher for road-activity loops and lower for hiking (where linear ridge runs are
     * valid).
     */
    private static double loopShapeScore(
            double overlapRatio,
            double compactness,
            double bearingCoverage,
            double backtrackRatio,
            int deadEndCount,
            double maxLegDetourRatio,
            double steepSpikeRatio,
            UserPreferences preferences) {
        double compactnessPenalty = Math.max(0, MIN_LOOP_COMPACTNESS - compactness) / MIN_LOOP_COMPACTNESS;
        double legDetourPenalty = Math.max(0, maxLegDetourRatio - 2.0);

        // Bearing coverage matters more for running/cycling, less for hiking
        double bearingWeight = preferences.activity() == ActivityType.HIKING ? 12 : 22;

        double score = 100
                - overlapRatio * 60            // was 150 — reduced since we now filter strictly
                - backtrackRatio * 80          // was 120
                - deadEndCount * 25            // was 35
                - compactnessPenalty * 35      // was 45
                - legDetourPenalty * 15        // was 18
                - steepSpikeRatio * 70         // was 90
                + bearingCoverage * bearingWeight;  // was 10 fixed

        return Math.max(0, Math.min(100, Math.round(score)));
    }

    private static boolean isRealLoopShape(LoopShape shape, UserPreferences preferences) {
        double maxBacktrack = preferences.activity() == ActivityType.HIKING
                ? MAX_BACKTRACK_RATIO_HIKING : MAX_BACKTRACK_RATIO;
        return shape.overlapRatio <= LOOSE_OVERLAP_LIMIT
                && shape.deadEndCount == 0
                && shape.compactness >= MIN_LOOP_COMPACTNESS
                && shape.backtrackRatio <= maxBacktrack
                && shape.maxLegDetourRatio <= MAX_LEG_DETOUR_RATIO
                && shape.steepSpikeRatio <= MAX_STEEP_SPIKE_RATIO;
    }

    // ------------------------------------------------------------------
    // Loop naming
    // ------------------------------------------------------------------

    private static String deriveLoopName(LoopShape shape, RouteStrategy strategy, int waypointCount) {
        if (strategy == RouteStrategy.PARK) {
            return "Park Loop";
        }
        if (waypointCount >= 3) {
            return shape.bearingCoverage >= 0.6 ? "Triangle Loop" : "Scenic Loop";
        }
        if (shape.bearingCoverage >= 0.75) {
            return "City Loop";
        }
        if (shape.compactness >= 0.1) {
            return "Compact Loop";
        }
        return "Balanced Loop";
    }
}
