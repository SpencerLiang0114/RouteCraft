package com.routecraft.api.routing.generator;

import java.util.ArrayList;
import java.util.Comparator;
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
import com.routecraft.api.routing.model.LatLng;
import com.routecraft.api.routing.model.RouteType;
import com.routecraft.api.routing.model.UserPreferences;

public final class PointToPointGenerator {

    private PointToPointGenerator() {
    }

    public static List<GeneratedRouteCandidate> generate(UserPreferences preferences, RouteGraph graph) {
        LatLng startPoint = preferences.startPoint() != null ? preferences.startPoint() : CandidateSelector.FALLBACK_START;
        double targetDistanceKm = GeoUtils.resolveTargetDistanceKm(preferences);
        LatLng fallbackEndPoint = GeoUtils.destinationPoint(startPoint, 65, targetDistanceKm * 700);
        RouteNode startNode = graph.findNearestNode(startPoint);
        RouteNode endNode = graph.findNearestNode(preferences.endPoint() != null ? preferences.endPoint() : fallbackEndPoint);
        if (startNode == null || endNode == null || startNode.id().equals(endNode.id())) {
            return List.of();
        }

        List<PathResult> paths = Pathfinding.findKShortestPaths(graph, startNode.id(), endNode.id(), preferences, 9);
        Set<String> shortestReference = null;
        if (!paths.isEmpty()) {
            shortestReference = new HashSet<>();
            for (RouteEdge edge : paths.get(0).edges()) {
                shortestReference.add(edge.undirectedKey());
            }
        }
        double targetDistanceM = targetDistanceKm * 1000;
        List<PathResult> detourPaths = new ArrayList<>();
        if (!paths.isEmpty() && targetDistanceM > paths.get(0).distanceM() * 1.2) {
            detourPaths = buildDetours(graph, preferences, startNode, endNode, targetDistanceM);
        }

        List<PathResult> all = new ArrayList<>(paths);
        all.addAll(detourPaths);

        List<GeneratedRouteCandidate> result = new ArrayList<>();
        for (int i = 0; i < all.size(); i++) {
            boolean isDetour = i >= paths.size();
            RouteStrategy strategy = i == 0
                    ? RouteStrategy.DIRECT
                    : (isDetour || i % 2 == 0 ? RouteStrategy.EXPLORATION : RouteStrategy.RECOMMENDED);
            Set<String> referenceEdgeIds = i == 0 ? null : shortestReference;
            String name = i == 0 ? "Efficient Connector" : (isDetour ? "Target-Distance Detour" : "Alternative Connector");
            RouteDraft draft = new RouteDraft(
                    "generated-point-" + (i + 1),
                    name,
                    preferences.activity(),
                    RouteType.POINT_TO_POINT,
                    all.get(i),
                    List.of(endNode.point()),
                    strategy,
                    referenceEdgeIds);
            result.add(RouteAnalyzer.buildRouteCandidate(draft, preferences));
        }
        return result;
    }

    private static List<PathResult> buildDetours(
            RouteGraph graph,
            UserPreferences preferences,
            RouteNode startNode,
            RouteNode endNode,
            double targetDistanceM) {
        record DetourCandidate(RouteNode node, double straightLineDetourM) {}
        List<DetourCandidate> candidates = new ArrayList<>();
        for (RouteNode node : graph.nodeValues()) {
            if (node.id().equals(startNode.id()) || node.id().equals(endNode.id())) continue;
            double straightLineDetourM = GeoUtils.distanceM(startNode.point(), node.point())
                    + GeoUtils.distanceM(node.point(), endNode.point());
            if (Math.abs(straightLineDetourM - targetDistanceM) <= targetDistanceM * 0.45) {
                candidates.add(new DetourCandidate(node, straightLineDetourM));
            }
        }
        candidates.sort(Comparator.comparingDouble(c -> Math.abs(c.straightLineDetourM - targetDistanceM)));
        if (candidates.size() > 18) {
            candidates = candidates.subList(0, 18);
        }

        List<PathResult> detours = new ArrayList<>();
        Set<String> blockedEnd = Set.of(endNode.id());
        Set<String> blockedStart = Set.of(startNode.id());
        for (DetourCandidate item : candidates) {
            Optional<PathResult> firstLeg = Pathfinding.findShortestPath(graph, startNode.id(), item.node.id(), preferences,
                    new PathOptions(null, blockedEnd, null));
            if (firstLeg.isEmpty()) continue;
            Map<String, Double> secondLegPenalties = new HashMap<>();
            for (RouteEdge edge : firstLeg.get().edges()) {
                secondLegPenalties.put(edge.undirectedKey(), 0.6);
            }
            Optional<PathResult> secondLeg = Pathfinding.findShortestPath(graph, item.node.id(), endNode.id(), preferences,
                    new PathOptions(null, blockedStart, secondLegPenalties));
            if (secondLeg.isEmpty()) continue;
            detours.add(Pathfinding.combinePaths(graph, List.of(firstLeg.get(), secondLeg.get())));
        }
        detours.sort(Comparator.comparingDouble(p -> Math.abs(p.distanceM() - targetDistanceM)));
        if (detours.size() > 8) {
            detours = detours.subList(0, 8);
        }
        return detours;
    }
}
