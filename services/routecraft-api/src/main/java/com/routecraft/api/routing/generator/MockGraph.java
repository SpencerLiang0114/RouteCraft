package com.routecraft.api.routing.generator;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.routecraft.api.routing.graph.GeoUtils;
import com.routecraft.api.routing.graph.RouteEdge;
import com.routecraft.api.routing.graph.RouteGraph;
import com.routecraft.api.routing.graph.RouteNode;
import com.routecraft.api.routing.model.LatLng;
import com.routecraft.api.routing.model.UserPreferences;

public final class MockGraph {

    private static final int[] BEARINGS = {0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330};
    private static final double[] BASE_RADII_M = {650, 1200, 1900, 2800, 3900, 5400, 7200, 9600, 12500, 16500};

    private MockGraph() {
    }

    public static RouteGraph load(LatLng startPoint, UserPreferences preferences) {
        double targetDistanceKm = preferences != null ? GeoUtils.resolveTargetDistanceKm(preferences) : 8;
        double maxUsefulRadiusM = Math.max(5000, targetDistanceKm * 1000 * 0.48);
        List<Double> radii = new ArrayList<>();
        for (double r : BASE_RADII_M) {
            if (r <= maxUsefulRadiusM + 4500) radii.add(r);
        }

        Map<String, RouteNode> nodes = new HashMap<>();
        nodes.put("center", new RouteNode("center", startPoint));
        for (int ringIndex = 0; ringIndex < radii.size(); ringIndex++) {
            for (int bearing : BEARINGS) {
                String id = ringNodeId(ringIndex, bearing);
                nodes.put(id, new RouteNode(id, GeoUtils.destinationPoint(startPoint, bearing, radii.get(ringIndex))));
            }
        }

        List<RouteEdge> directed = new ArrayList<>();
        RouteNode center = nodes.get("center");
        for (int bearing : BEARINGS) {
            connect(directed, nodes, center, "center", ringNodeId(0, bearing), "spoke-center-" + bearing, true);
        }
        for (int ringIndex = 0; ringIndex < radii.size(); ringIndex++) {
            for (int b = 0; b < BEARINGS.length; b++) {
                int bearing = BEARINGS[b];
                int nextBearing = BEARINGS[(b + 1) % BEARINGS.length];
                String currentId = ringNodeId(ringIndex, bearing);
                String nextId = ringNodeId(ringIndex, nextBearing);
                boolean restricted = ringIndex == 1 && bearing == 210;
                connect(directed, nodes, center, currentId, nextId, "ring-" + ringIndex + "-" + bearing, !restricted);
                if (ringIndex < radii.size() - 1) {
                    connect(directed, nodes, center, currentId, ringNodeId(ringIndex + 1, bearing),
                            "radial-" + ringIndex + "-" + bearing, true);
                    if (b % 2 == 0) {
                        connect(directed, nodes, center, currentId, ringNodeId(ringIndex + 1, nextBearing),
                                "diagonal-" + ringIndex + "-" + bearing, true);
                    }
                }
            }
        }

        addUserEndNode(nodes, directed, preferences == null ? null : preferences.endPoint());

        return new RouteGraph(new ArrayList<>(nodes.values()), RouteGraph.bidirectional(directed));
    }

    private static String ringNodeId(int ringIndex, int bearing) {
        return "r" + ringIndex + "-" + bearing;
    }

    private static void connect(
            List<RouteEdge> edges,
            Map<String, RouteNode> nodes,
            RouteNode center,
            String fromId,
            String toId,
            String id,
            boolean accessAllowed) {
        RouteNode from = nodes.get(fromId);
        RouteNode to = nodes.get(toId);
        if (from == null || to == null) return;
        LatLng midpoint = new LatLng(
                (from.point().lat() + to.point().lat()) / 2,
                (from.point().lng() + to.point().lng()) / 2);
        double midpointBearing = GeoUtils.bearingDegrees(center.point(), midpoint);
        double midpointDistance = GeoUtils.distanceM(center.point(), midpoint);
        edges.add(createEdge(id, from, to, midpointBearing, midpointDistance, accessAllowed));
    }

    private static RouteEdge createEdge(String id, RouteNode from, RouteNode to,
            double bearing, double radiusM, boolean accessAllowed) {
        Metadata m = scoreForBearing(bearing, radiusM);
        double segmentDistanceM = GeoUtils.distanceM(from.point(), to.point());
        double elevationGainM = elevationGainForSegment(from.point(), to.point());
        double slope = segmentDistanceM > 0 ? elevationGainM / segmentDistanceM : 0;
        return RouteEdge.builder()
                .id(id)
                .from(from.id())
                .to(to.id())
                .distanceM(Math.round(segmentDistanceM))
                .geometry(List.of(from.point(), to.point()))
                .surfaceType(m.surfaceType)
                .roadType(m.roadType)
                .elevationGainM(elevationGainM)
                .slope(slope)
                .parkScore(m.parkScore)
                .shadeScore(m.shadeScore)
                .safetyScore(accessAllowed ? m.safetyScore : 0.05)
                .sceneryScore(m.sceneryScore)
                .bikeScore(m.bikeScore)
                .walkScore(m.walkScore)
                .accessAllowed(accessAllowed)
                .noveltyScore(m.noveltyScore)
                .trafficExposure(m.trafficExposure)
                .accessRestrictions(accessAllowed ? null : List.of("private"))
                .build();
    }

    private static double elevationGainForSegment(LatLng from, LatLng to) {
        double bearing = GeoUtils.bearingDegrees(from, to);
        double uphillBias = Math.cos((bearing * Math.PI) / 180) * 0.018
                + Math.sin((bearing * Math.PI) / 180) * 0.01;
        double segmentDistanceM = GeoUtils.distanceM(from, to);
        return Math.round(segmentDistanceM * uphillBias * 10) / 10.0;
    }

    private static Metadata scoreForBearing(double bearing, double radiusM) {
        boolean isOuterTrail = radiusM >= 5400 && (bearing <= 90 || bearing >= 300);
        boolean isParkCorridor = bearing >= 30 && bearing <= 150;
        boolean isOpenWaterfront = bearing >= 240 && bearing <= 300;
        boolean isArterial = bearing >= 180 && bearing <= 240 && radiusM < 5400;

        if (isOuterTrail) {
            return new Metadata("trail", "dirt", 0.86, 0.76, 0.78, 0.9, 0.54, 0.94, 0.88, 0.04);
        }
        if (isParkCorridor) {
            return new Metadata("park_path", "paved", 0.9, 0.82, 0.86, 0.84, 0.78, 0.93, 0.72, 0.06);
        }
        if (isOpenWaterfront) {
            return new Metadata("greenway", "paved", 0.68, 0.38, 0.82, 0.92, 0.84, 0.82, 0.7, 0.08);
        }
        if (isArterial) {
            return new Metadata("arterial", "sidewalk", 0.18, 0.28, 0.46, 0.36, 0.42, 0.5, 0.28, 0.72);
        }
        return new Metadata("residential", "sidewalk", 0.36, 0.48, 0.72, 0.5, 0.64, 0.76, 0.48, 0.24);
    }

    private static void addUserEndNode(Map<String, RouteNode> nodes, List<RouteEdge> edges, LatLng endPoint) {
        if (endPoint == null) return;
        RouteNode endNode = new RouteNode("user-end", endPoint);
        nodes.put(endNode.id(), endNode);

        record NodeDist(RouteNode node, double distanceM) {}
        List<NodeDist> sorted = new ArrayList<>();
        for (RouteNode node : nodes.values()) {
            if (node.id().equals(endNode.id())) continue;
            sorted.add(new NodeDist(node, GeoUtils.distanceM(endPoint, node.point())));
        }
        sorted.sort(Comparator.comparingDouble(NodeDist::distanceM));
        RouteNode center = nodes.get("center");
        for (int i = 0; i < Math.min(4, sorted.size()); i++) {
            connect(edges, nodes, center, sorted.get(i).node.id(), endNode.id(), "end-link-" + i, true);
        }
    }

    private record Metadata(
            String roadType,
            String surfaceType,
            double parkScore,
            double shadeScore,
            double safetyScore,
            double sceneryScore,
            double bikeScore,
            double walkScore,
            double noveltyScore,
            double trafficExposure) {
    }
}
