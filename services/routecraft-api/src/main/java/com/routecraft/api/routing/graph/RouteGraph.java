package com.routecraft.api.routing.graph;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.routecraft.api.routing.model.LatLng;

public final class RouteGraph {

    private final Map<String, RouteNode> nodes;
    private final List<RouteEdge> edges;
    private final Map<String, List<RouteEdge>> adjacency;
    private final KdTree kdTree;

    public RouteGraph(List<RouteNode> nodes, List<RouteEdge> edges) {
        Map<String, RouteNode> nodeMap = new HashMap<>(nodes.size() * 2);
        for (RouteNode node : nodes) {
            nodeMap.put(node.id(), node);
        }
        this.nodes = nodeMap;
        this.edges = List.copyOf(edges);
        Map<String, List<RouteEdge>> adj = new HashMap<>();
        for (RouteNode node : nodes) {
            adj.put(node.id(), new ArrayList<>());
        }
        for (RouteEdge edge : edges) {
            adj.computeIfAbsent(edge.from(), k -> new ArrayList<>()).add(edge);
        }
        this.adjacency = adj;
        this.kdTree = new KdTree(nodes);
    }

    public Map<String, RouteNode> nodes() {
        return nodes;
    }

    public Collection<RouteNode> nodeValues() {
        return nodes.values();
    }

    public List<RouteEdge> edges() {
        return edges;
    }

    public List<RouteEdge> adjacent(String nodeId) {
        return adjacency.getOrDefault(nodeId, List.of());
    }

    public RouteNode findNearestNode(LatLng point) {
        return kdTree.nearest(point);
    }

    public List<RangeHit> findNodesInRing(LatLng point, double radiusM, double toleranceM) {
        List<KdTree.RangeHit> hits = new ArrayList<>();
        kdTree.rangeRing(point, radiusM, toleranceM, hits);
        List<RangeHit> results = new ArrayList<>(hits.size());
        for (KdTree.RangeHit hit : hits) {
            results.add(new RangeHit(hit.node(), hit.distanceM()));
        }
        return results;
    }

    public record RangeHit(RouteNode node, double distanceM) {
    }

    public static List<RouteEdge> bidirectional(List<RouteEdge> edges) {
        List<RouteEdge> result = new ArrayList<>(edges.size() * 2);
        for (RouteEdge edge : edges) {
            result.add(edge);
            result.add(edge.reverse());
        }
        return result;
    }
}
