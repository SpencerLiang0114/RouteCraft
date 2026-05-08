package com.routecraft.api.routing.graph;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.PriorityQueue;
import java.util.Set;

import com.routecraft.api.routing.model.LatLng;
import com.routecraft.api.routing.model.UserPreferences;

public final class Pathfinding {

    private Pathfinding() {
    }

    public static Optional<PathResult> findShortestPath(
            RouteGraph graph,
            String startId,
            String endId,
            UserPreferences preferences) {
        return findShortestPath(graph, startId, endId, preferences, PathOptions.empty());
    }

    public static Optional<PathResult> findShortestPath(
            RouteGraph graph,
            String startId,
            String endId,
            UserPreferences preferences,
            PathOptions options) {
        if (startId.equals(endId)) {
            return Optional.of(pathFromEdges(graph, List.of(startId), List.of(), 0));
        }

        PriorityQueue<QueueItem> queue = new PriorityQueue<>(Comparator.comparingDouble(QueueItem::priority));
        queue.offer(new QueueItem(startId, 0));
        Map<String, Step> cameFrom = new HashMap<>();
        Map<String, Double> costSoFar = new HashMap<>();
        costSoFar.put(startId, 0.0);
        Set<String> settled = new HashSet<>();

        Set<String> blockedEdges = options.blockedEdgeIds();
        Set<String> blockedNodes = options.blockedNodeIds();
        Map<String, Double> edgePenalties = options.edgePenalties();

        while (!queue.isEmpty()) {
            QueueItem current = queue.poll();
            if (!settled.add(current.nodeId)) {
                continue;
            }

            if (current.nodeId.equals(endId)) {
                return Optional.of(reconstructPath(graph, startId, endId, cameFrom,
                        costSoFar.getOrDefault(endId, 0.0)));
            }

            for (RouteEdge edge : graph.adjacent(current.nodeId)) {
                if (blockedEdges != null && (blockedEdges.contains(edge.id()) || blockedEdges.contains(edge.undirectedKey()))) {
                    continue;
                }
                if (blockedNodes != null && !edge.to().equals(endId) && blockedNodes.contains(edge.to())) {
                    continue;
                }

                double cost = EdgeCost.compute(edge, preferences);
                if (!Double.isFinite(cost)) {
                    continue;
                }

                double penalty = 0;
                if (edgePenalties != null) {
                    Double byId = edgePenalties.get(edge.id());
                    Double byKey = edgePenalties.get(edge.undirectedKey());
                    penalty = byId != null ? byId : (byKey != null ? byKey : 0);
                }

                double currentCost = costSoFar.getOrDefault(current.nodeId, 0.0);
                double nextCost = currentCost + cost + penalty;
                Double known = costSoFar.get(edge.to());

                if (known == null || nextCost < known) {
                    costSoFar.put(edge.to(), nextCost);
                    cameFrom.put(edge.to(), new Step(current.nodeId, edge));
                    queue.offer(new QueueItem(edge.to(), nextCost + heuristicCost(graph, edge.to(), endId)));
                }
            }
        }

        return Optional.empty();
    }

    private static double heuristicCost(RouteGraph graph, String fromId, String toId) {
        RouteNode from = graph.nodes().get(fromId);
        RouteNode to = graph.nodes().get(toId);
        if (from == null || to == null) {
            return 0;
        }
        return GeoUtils.distanceM(from.point(), to.point()) * 0.2;
    }

    private static PathResult reconstructPath(
            RouteGraph graph,
            String startId,
            String endId,
            Map<String, Step> cameFrom,
            double totalCost) {
        List<RouteEdge> edges = new ArrayList<>();
        Deque<String> nodeIds = new ArrayDeque<>();
        nodeIds.push(endId);
        String current = endId;

        while (!current.equals(startId)) {
            Step step = cameFrom.get(current);
            if (step == null) {
                return pathFromEdges(graph, List.of(startId), List.of(), 0);
            }
            edges.add(step.edge);
            current = step.previousNodeId;
            nodeIds.push(current);
        }

        java.util.Collections.reverse(edges);
        return pathFromEdges(graph, new ArrayList<>(nodeIds), edges, totalCost);
    }

    public static PathResult pathFromEdges(
            RouteGraph graph,
            List<String> nodeIds,
            List<RouteEdge> edges,
            double cost) {
        List<LatLng> geometry = new ArrayList<>();
        for (int i = 0; i < edges.size(); i++) {
            List<LatLng> pts = edges.get(i).geometry();
            int start = i == 0 ? 0 : 1;
            for (int j = start; j < pts.size(); j++) {
                geometry.add(pts.get(j));
            }
        }
        if (geometry.isEmpty() && !nodeIds.isEmpty()) {
            geometry.add(graph.nodes().get(nodeIds.get(0)).point());
        }
        double distanceM = 0;
        for (RouteEdge edge : edges) {
            distanceM += edge.distanceM();
        }
        return new PathResult(List.copyOf(nodeIds), List.copyOf(edges), List.copyOf(geometry), distanceM, cost);
    }

    public static List<PathResult> findKShortestPaths(
            RouteGraph graph,
            String startId,
            String endId,
            UserPreferences preferences,
            int maxPaths) {
        Optional<PathResult> firstPath = findShortestPath(graph, startId, endId, preferences);
        if (firstPath.isEmpty()) {
            return List.of();
        }
        List<PathResult> accepted = new ArrayList<>();
        accepted.add(firstPath.get());

        List<PathResult> candidates = new ArrayList<>();
        Set<String> candidateSignatures = new HashSet<>();
        candidateSignatures.add(pathSignature(firstPath.get()));

        for (int k = 1; k < maxPaths; k++) {
            PathResult previousPath = accepted.get(k - 1);

            for (int spurIndex = 0; spurIndex < previousPath.nodeIds().size() - 1; spurIndex++) {
                String spurNodeId = previousPath.nodeIds().get(spurIndex);
                List<RouteEdge> rootEdges = previousPath.edges().subList(0, spurIndex);
                List<String> rootNodeIds = previousPath.nodeIds().subList(0, spurIndex + 1);

                Set<String> blockedEdgeIds = new HashSet<>();
                Set<String> blockedNodeIds = new HashSet<>(rootNodeIds.subList(0, rootNodeIds.size() - 1));

                for (PathResult path : accepted) {
                    boolean hasSameRoot = true;
                    for (int i = 0; i < rootEdges.size(); i++) {
                        if (i >= path.edges().size() || !path.edges().get(i).id().equals(rootEdges.get(i).id())) {
                            hasSameRoot = false;
                            break;
                        }
                    }
                    if (hasSameRoot && spurIndex < path.edges().size()) {
                        RouteEdge edgeToBlock = path.edges().get(spurIndex);
                        blockedEdgeIds.add(edgeToBlock.id());
                        blockedEdgeIds.add(edgeToBlock.undirectedKey());
                    }
                }

                Optional<PathResult> spurPath = findShortestPath(
                        graph, spurNodeId, endId, preferences,
                        new PathOptions(blockedEdgeIds, blockedNodeIds, null));

                if (spurPath.isEmpty()) {
                    continue;
                }

                List<RouteEdge> combinedEdges = new ArrayList<>(rootEdges);
                combinedEdges.addAll(spurPath.get().edges());
                List<String> combinedNodeIds = new ArrayList<>(rootNodeIds);
                if (spurPath.get().nodeIds().size() > 1) {
                    combinedNodeIds.addAll(spurPath.get().nodeIds().subList(1, spurPath.get().nodeIds().size()));
                }
                double rootCost = 0;
                for (RouteEdge edge : rootEdges) {
                    rootCost += EdgeCost.compute(edge, preferences);
                }
                PathResult combinedPath = pathFromEdges(
                        graph, combinedNodeIds, combinedEdges, rootCost + spurPath.get().cost());
                String signature = pathSignature(combinedPath);
                if (candidateSignatures.add(signature)) {
                    candidates.add(combinedPath);
                }
            }

            candidates.sort(Comparator.comparingDouble(PathResult::cost));
            if (candidates.isEmpty()) {
                break;
            }
            accepted.add(candidates.remove(0));
        }

        return accepted;
    }

    private static String pathSignature(PathResult path) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < path.edges().size(); i++) {
            if (i > 0) {
                sb.append('|');
            }
            sb.append(path.edges().get(i).undirectedKey());
        }
        return sb.toString();
    }

    public static PathResult reversePath(PathResult path) {
        List<RouteEdge> edges = new ArrayList<>();
        for (int i = path.edges().size() - 1; i >= 0; i--) {
            edges.add(path.edges().get(i).reverse());
        }
        List<String> nodeIds = new ArrayList<>(path.nodeIds());
        java.util.Collections.reverse(nodeIds);
        List<LatLng> geometry = new ArrayList<>(path.geometry());
        java.util.Collections.reverse(geometry);
        return new PathResult(nodeIds, edges, geometry, path.distanceM(), path.cost());
    }

    public static PathResult despikePath(RouteGraph graph, PathResult path) {
        if (path.edges().isEmpty()) {
            return path;
        }
        List<RouteEdge> stack = new ArrayList<>();
        for (RouteEdge edge : path.edges()) {
            RouteEdge top = stack.isEmpty() ? null : stack.get(stack.size() - 1);
            if (top != null && top.from().equals(edge.to()) && top.to().equals(edge.from())) {
                stack.remove(stack.size() - 1);
            } else {
                stack.add(edge);
            }
        }
        if (stack.size() == path.edges().size()) {
            return path;
        }
        String startNodeId = path.nodeIds().get(0);
        if (stack.isEmpty()) {
            return pathFromEdges(graph, List.of(startNodeId), List.of(), 0);
        }
        List<String> newNodeIds = new ArrayList<>();
        newNodeIds.add(stack.get(0).from());
        for (RouteEdge edge : stack) {
            newNodeIds.add(edge.to());
        }
        double newDistanceM = 0;
        for (RouteEdge edge : stack) {
            newDistanceM += edge.distanceM();
        }
        double newCost = path.distanceM() > 0 ? path.cost() * (newDistanceM / path.distanceM()) : 0;
        return pathFromEdges(graph, newNodeIds, stack, newCost);
    }

    public static Map<String, Double> singleSourceShortestDistances(RouteGraph graph, String startId) {
        Map<String, Double> distances = new HashMap<>();
        distances.put(startId, 0.0);
        PriorityQueue<QueueItem> queue = new PriorityQueue<>(Comparator.comparingDouble(QueueItem::priority));
        queue.offer(new QueueItem(startId, 0));
        Set<String> settled = new HashSet<>();

        while (!queue.isEmpty()) {
            QueueItem current = queue.poll();
            if (!settled.add(current.nodeId)) {
                continue;
            }
            for (RouteEdge edge : graph.adjacent(current.nodeId)) {
                if (!edge.accessAllowed()) {
                    continue;
                }
                double currentDist = distances.getOrDefault(current.nodeId, 0.0);
                double nextDist = currentDist + edge.distanceM();
                Double known = distances.get(edge.to());
                if (known == null || nextDist < known) {
                    distances.put(edge.to(), nextDist);
                    queue.offer(new QueueItem(edge.to(), nextDist));
                }
            }
        }
        return distances;
    }

    public static double pathSelfOverlapRatio(PathResult path) {
        if (path.edges().isEmpty() || path.distanceM() <= 0) {
            return 0;
        }
        Map<String, Integer> useCount = new HashMap<>();
        for (RouteEdge edge : path.edges()) {
            useCount.merge(edge.undirectedKey(), 1, Integer::sum);
        }
        double overlap = 0;
        for (RouteEdge edge : path.edges()) {
            if (useCount.getOrDefault(edge.undirectedKey(), 0) > 1) {
                overlap += edge.distanceM();
            }
        }
        return overlap / path.distanceM();
    }

    public static PathResult combinePaths(RouteGraph graph, List<PathResult> paths) {
        List<RouteEdge> edges = new ArrayList<>();
        List<String> nodeIds = new ArrayList<>();
        double cost = 0;
        for (int i = 0; i < paths.size(); i++) {
            PathResult path = paths.get(i);
            edges.addAll(path.edges());
            int start = i == 0 ? 0 : 1;
            for (int j = start; j < path.nodeIds().size(); j++) {
                nodeIds.add(path.nodeIds().get(j));
            }
            cost += path.cost();
        }
        return pathFromEdges(graph, nodeIds, edges, cost);
    }

    private record QueueItem(String nodeId, double priority) {
    }

    private record Step(String previousNodeId, RouteEdge edge) {
    }
}
