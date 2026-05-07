package com.routecraft.api.routing.generator;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

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

    private static final double PREVIOUS_EDGE_PENALTY = 2.25;
    private static final double CLOSING_SEGMENT_EXTRA_PENALTY = 1.75;
    private static final double STRICT_OVERLAP_LIMIT = 0.12;
    private static final double LOOSE_OVERLAP_LIMIT = 0.24;
    private static final double MIN_LOOP_COMPACTNESS = 0.025;
    private static final double MAX_BACKTRACK_RATIO = 0.18;
    private static final double MAX_LEG_DETOUR_RATIO = 2.8;
    private static final double MAX_STEEP_SPIKE_RATIO = 0.16;

    private LoopGenerator() {
    }

    public static List<GeneratedRouteCandidate> generate(UserPreferences preferences, RouteGraph graph) {
        RouteNode startNode = CandidateSelector.getStartNode(graph, preferences);
        List<CandidateSelector.WaypointSet> waypointSets = CandidateSelector.generateLoopWaypointSets(preferences, graph, startNode);

        record Built(GeneratedRouteCandidate candidate, LoopShape shape) {}
        List<Built> built = new ArrayList<>();

        for (int index = 0; index < waypointSets.size(); index++) {
            CandidateSelector.WaypointSet set = waypointSets.get(index);
            List<String> nodeIds = new ArrayList<>();
            nodeIds.add(startNode.id());
            nodeIds.addAll(set.nodeIds());
            nodeIds.add(startNode.id());

            List<PathResult> segments = new ArrayList<>();
            List<Double> legDetourRatios = new ArrayList<>();
            Map<String, Double> edgePenalties = new HashMap<>();
            boolean failed = false;

            for (int step = 0; step < nodeIds.size() - 1; step++) {
                boolean isClosingSegment = step == nodeIds.size() - 2;
                Map<String, Double> segmentPenalties;
                if (isClosingSegment) {
                    segmentPenalties = new HashMap<>(edgePenalties.size());
                    for (Map.Entry<String, Double> e : edgePenalties.entrySet()) {
                        segmentPenalties.put(e.getKey(), e.getValue() + CLOSING_SEGMENT_EXTRA_PENALTY);
                    }
                } else {
                    segmentPenalties = edgePenalties;
                }

                Optional<PathResult> segment = Pathfinding.findShortestPath(
                        graph, nodeIds.get(step), nodeIds.get(step + 1), preferences,
                        new PathOptions(null, null, segmentPenalties));
                if (segment.isEmpty()) {
                    failed = true;
                    break;
                }
                segments.add(segment.get());
                double directDistanceM = GeoUtils.distanceM(
                        graph.nodes().get(nodeIds.get(step)).point(),
                        graph.nodes().get(nodeIds.get(step + 1)).point());
                legDetourRatios.add(directDistanceM > 40 ? segment.get().distanceM() / directDistanceM : 1);

                for (RouteEdge edge : segment.get().edges()) {
                    edgePenalties.merge(edge.undirectedKey(), PREVIOUS_EDGE_PENALTY, Double::sum);
                }
            }

            if (failed) continue;

            PathResult combined = Pathfinding.combinePaths(graph, segments);
            PathResult path = Pathfinding.despikePath(graph, combined);
            if (path.edges().isEmpty()) continue;

            LoopShape shape = evaluateLoopShape(graph, path, startNode.point(), legDetourRatios, preferences);

            List<LatLng> waypoints = new ArrayList<>();
            for (String id : set.nodeIds()) {
                waypoints.add(graph.nodes().get(id).point());
            }
            String name = set.strategy() == RouteStrategy.PARK ? "Park-Weighted Loop" : "Balanced Loop";
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

        List<Built> realLoops = new ArrayList<>();
        for (Built b : built) {
            if (isRealLoopShape(b.shape())) realLoops.add(b);
        }
        List<Built> strict = new ArrayList<>();
        for (Built b : realLoops) {
            if (b.shape().overlapRatio <= STRICT_OVERLAP_LIMIT) strict.add(b);
        }
        if (strict.size() >= 3) {
            return strict.stream().map(Built::candidate).toList();
        }
        List<Built> loose = new ArrayList<>();
        for (Built b : realLoops) {
            if (b.shape().overlapRatio <= LOOSE_OVERLAP_LIMIT) loose.add(b);
        }
        if (loose.size() >= 3) {
            return loose.stream().map(Built::candidate).toList();
        }
        return realLoops.stream().map(Built::candidate).toList();
    }

    private static GeneratedRouteCandidate withShapeAdjustedScore(GeneratedRouteCandidate candidate, LoopShape shape) {
        RouteMetrics m = candidate.candidate().metrics();
        double adjusted = Math.max(0, Math.min(100,
                Math.round(m.totalScore() * 0.78 + shape.score * 0.22)));
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
                deadEndCount, maxLegDetourRatio, steepSpikeRatio);
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
        double slopeLimit = preferences.activity() == ActivityType.CYCLING ? 0.1 : 0.14;
        double spike = 0;
        for (RouteEdge edge : path.edges()) {
            double slope = Math.abs(edge.slope() == null ? 0 : edge.slope());
            if (slope > slopeLimit && edge.distanceM() <= 700) {
                spike += edge.distanceM();
            }
        }
        return spike / path.distanceM();
    }

    private static double loopShapeScore(
            double overlapRatio,
            double compactness,
            double bearingCoverage,
            double backtrackRatio,
            int deadEndCount,
            double maxLegDetourRatio,
            double steepSpikeRatio) {
        double compactnessPenalty = Math.max(0, MIN_LOOP_COMPACTNESS - compactness) / MIN_LOOP_COMPACTNESS;
        double legDetourPenalty = Math.max(0, maxLegDetourRatio - 2.1);
        return Math.round(
                100
                        - overlapRatio * 150
                        - backtrackRatio * 120
                        - deadEndCount * 35
                        - compactnessPenalty * 45
                        - legDetourPenalty * 18
                        - steepSpikeRatio * 90
                        + bearingCoverage * 10);
    }

    private static boolean isRealLoopShape(LoopShape shape) {
        return shape.overlapRatio <= LOOSE_OVERLAP_LIMIT
                && shape.deadEndCount == 0
                && shape.compactness >= MIN_LOOP_COMPACTNESS
                && shape.backtrackRatio <= MAX_BACKTRACK_RATIO
                && shape.maxLegDetourRatio <= MAX_LEG_DETOUR_RATIO
                && shape.steepSpikeRatio <= MAX_STEEP_SPIKE_RATIO;
    }
}
