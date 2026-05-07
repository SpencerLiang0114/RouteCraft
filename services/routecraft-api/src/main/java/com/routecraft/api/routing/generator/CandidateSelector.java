package com.routecraft.api.routing.generator;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
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
            return Double.compare(
                    Math.abs(a.candidate().elevationGainM()),
                    Math.abs(b.candidate().elevationGainM()));
        });
        return sorted;
    }

    public static List<WaypointSet> generateLoopWaypointSets(
            UserPreferences preferences,
            RouteGraph graph,
            RouteNode startNode) {
        double targetDistanceM = GeoUtils.resolveTargetDistanceKm(preferences) * 1000;
        double twoWpBaseRadiusM = Math.max(450, targetDistanceM / 4.5);
        double threeWpBaseRadiusM = Math.max(300, targetDistanceM / 6);
        double[] bearings = {0, 45, 90, 135, 180, 225, 270, 315};
        List<WaypointSet> sets = new ArrayList<>();

        for (double radiusM : new double[]{twoWpBaseRadiusM * 0.9, twoWpBaseRadiusM, twoWpBaseRadiusM * 1.1}) {
            for (double bearing : bearings) {
                Set<String> excluded = new HashSet<>();
                excluded.add(startNode.id());
                RouteNode first = pickBestNodeNear(graph,
                        GeoUtils.destinationPoint(startNode.point(), bearing, radiusM * 0.92),
                        preferences, excluded);
                if (first == null) continue;
                excluded.add(first.id());

                RouteNode second = pickBestNodeNear(graph,
                        GeoUtils.destinationPoint(startNode.point(), (bearing + 100) % 360, radiusM * 1.04),
                        preferences, excluded);
                if (second != null) {
                    RouteStrategy strategy = ((int) bearing) % 90 == 0 ? RouteStrategy.RECOMMENDED : RouteStrategy.EXPLORATION;
                    sets.add(new WaypointSet(List.of(first.id(), second.id()), strategy));
                }
            }
        }

        for (double radiusM : new double[]{threeWpBaseRadiusM * 0.9, threeWpBaseRadiusM, threeWpBaseRadiusM * 1.1}) {
            for (double bearing : bearings) {
                Set<String> excluded = new HashSet<>();
                excluded.add(startNode.id());
                RouteNode first = pickBestNodeNear(graph,
                        GeoUtils.destinationPoint(startNode.point(), bearing, radiusM * 0.92),
                        preferences, excluded);
                if (first == null) continue;
                excluded.add(first.id());

                RouteNode second = pickBestNodeNear(graph,
                        GeoUtils.destinationPoint(startNode.point(), (bearing + 100) % 360, radiusM * 1.04),
                        preferences, excluded);
                if (second == null) continue;
                excluded.add(second.id());

                RouteNode third = pickBestNodeNear(graph,
                        GeoUtils.destinationPoint(startNode.point(), (bearing + 185) % 360, radiusM * 0.82),
                        preferences, excluded);
                if (third != null) {
                    sets.add(new WaypointSet(List.of(first.id(), second.id(), third.id()), RouteStrategy.PARK));
                }
            }
        }

        return sets;
    }

    private static RouteNode pickBestNodeNear(
            RouteGraph graph,
            LatLng point,
            UserPreferences preferences,
            Set<String> excluded) {
        RouteNode best = null;
        double bestScore = Double.NEGATIVE_INFINITY;
        for (RouteNode node : graph.nodeValues()) {
            if (excluded.contains(node.id())) continue;
            if (graph.adjacent(node.id()).size() < 2) continue;
            double score = routeQualityNearNode(graph, node.id(), preferences) * 1000
                    - GeoUtils.distanceM(point, node.point());
            if (score > bestScore) {
                bestScore = score;
                best = node;
            }
        }
        return best;
    }

    private static double routeQualityNearNode(RouteGraph graph, String nodeId, UserPreferences preferences) {
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

    public record WaypointSet(List<String> nodeIds, RouteStrategy strategy) {
        public WaypointSet {
            nodeIds = List.copyOf(nodeIds);
        }
    }

    private record Candidate(RouteNode node, double score, double distanceErrorM) {
    }
}
