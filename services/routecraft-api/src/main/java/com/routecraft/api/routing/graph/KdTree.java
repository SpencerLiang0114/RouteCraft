package com.routecraft.api.routing.graph;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import com.routecraft.api.routing.model.LatLng;

final class KdTree {

    private final Node root;

    KdTree(List<RouteNode> nodes) {
        this.root = build(new ArrayList<>(nodes), 0);
    }

    private static Node build(List<RouteNode> nodes, int depth) {
        if (nodes.isEmpty()) {
            return null;
        }
        int axis = depth % 2;
        Comparator<RouteNode> comparator = axis == 0
                ? Comparator.comparingDouble(n -> n.point().lat())
                : Comparator.comparingDouble(n -> n.point().lng());
        nodes.sort(comparator);
        int mid = nodes.size() / 2;
        return new Node(
                nodes.get(mid),
                build(new ArrayList<>(nodes.subList(0, mid)), depth + 1),
                build(new ArrayList<>(nodes.subList(mid + 1, nodes.size())), depth + 1),
                axis);
    }

    RouteNode nearest(LatLng point) {
        Best best = nearest(root, point, null);
        return best == null ? null : best.node;
    }

    private static Best nearest(Node tree, LatLng point, Best best) {
        if (tree == null) {
            return best;
        }
        double d = GeoUtils.distanceM(point, tree.routeNode.point());
        if (best == null || d < best.dist) {
            best = new Best(tree.routeNode, d);
        }
        boolean goLeft = (tree.axis == 0
                ? point.lat() - tree.routeNode.point().lat()
                : point.lng() - tree.routeNode.point().lng()) < 0;
        Node near = goLeft ? tree.left : tree.right;
        Node far = goLeft ? tree.right : tree.left;
        best = nearest(near, point, best);
        LatLng planePoint = tree.axis == 0
                ? new LatLng(tree.routeNode.point().lat(), point.lng())
                : new LatLng(point.lat(), tree.routeNode.point().lng());
        if (GeoUtils.distanceM(point, planePoint) < best.dist) {
            best = nearest(far, point, best);
        }
        return best;
    }

    void rangeRing(LatLng point, double radiusM, double toleranceM, List<RangeHit> results) {
        rangeRing(root, point, radiusM, toleranceM, results);
    }

    private static void rangeRing(Node tree, LatLng point, double radiusM, double toleranceM, List<RangeHit> results) {
        if (tree == null) {
            return;
        }
        double d = GeoUtils.distanceM(point, tree.routeNode.point());
        if (Math.abs(d - radiusM) <= toleranceM) {
            results.add(new RangeHit(tree.routeNode, d));
        }
        boolean goLeft = (tree.axis == 0
                ? point.lat() - tree.routeNode.point().lat()
                : point.lng() - tree.routeNode.point().lng()) < 0;
        Node near = goLeft ? tree.left : tree.right;
        Node far = goLeft ? tree.right : tree.left;
        rangeRing(near, point, radiusM, toleranceM, results);
        LatLng planePoint = tree.axis == 0
                ? new LatLng(tree.routeNode.point().lat(), point.lng())
                : new LatLng(point.lat(), tree.routeNode.point().lng());
        if (GeoUtils.distanceM(point, planePoint) <= radiusM + toleranceM) {
            rangeRing(far, point, radiusM, toleranceM, results);
        }
    }

    private record Node(RouteNode routeNode, Node left, Node right, int axis) {
    }

    private record Best(RouteNode node, double dist) {
    }

    record RangeHit(RouteNode node, double distanceM) {
    }
}
