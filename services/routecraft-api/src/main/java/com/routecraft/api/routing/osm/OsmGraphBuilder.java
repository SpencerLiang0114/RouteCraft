package com.routecraft.api.routing.osm;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import com.routecraft.api.routing.graph.GeoUtils;
import com.routecraft.api.routing.graph.RouteEdge;
import com.routecraft.api.routing.graph.RouteNode;
import com.routecraft.api.routing.model.LatLng;
import com.routecraft.api.routing.model.UserPreferences;

public final class OsmGraphBuilder {

    private OsmGraphBuilder() {
    }

    public static List<GreenFeature> getGreenFeatures(List<OsmElement> elements) {
        List<GreenFeature> features = new ArrayList<>();
        for (OsmElement element : elements) {
            if (!"way".equals(element.type())) continue;
            List<LatLng> geometry = element.geometryOrEmpty();
            if (geometry.size() < 2) continue;
            Map<String, String> tags = element.tagsOrEmpty();
            if (tags.containsKey("highway")) continue;
            features.add(new GreenFeature(geometry, OsmTagging.greenKind(tags)));
        }
        return features;
    }

    public static GraphDraft createEdges(
            List<OsmElement> elements,
            List<GreenFeature> greenFeatures,
            Map<String, Double> elevations,
            UserPreferences preferences) {
        Map<String, RouteNode> nodes = new HashMap<>();
        List<RouteEdge> edges = new ArrayList<>();

        List<OsmElement> highwayWays = new ArrayList<>();
        for (OsmElement element : elements) {
            if (!"way".equals(element.type())) continue;
            Map<String, String> tags = element.tagsOrEmpty();
            String highway = tags.get("highway");
            if (highway == null) continue;
            String service = tags.get("service");
            boolean lowValueService = "service".equals(highway)
                    && ("parking_aisle".equals(service) || "driveway".equals(service)
                    || "drive-through".equals(service) || "parking".equals(service));
            if (lowValueService) continue;
            if (element.geometryOrEmpty().isEmpty()) continue;
            if (!OsmTagging.accessAllowed(tags, preferences.activity())) continue;
            highwayWays.add(element);
        }

        Map<Long, Integer> nodeUseCount = new HashMap<>();
        for (OsmElement way : highwayWays) {
            for (Long nodeId : way.nodesOrEmpty()) {
                nodeUseCount.merge(nodeId, 1, Integer::sum);
            }
        }

        for (OsmElement way : highwayWays) {
            List<LatLng> geometry = way.geometryOrEmpty();
            Map<String, String> tags = way.tagsOrEmpty();
            int segmentStartIndex = 0;
            double segmentDistanceM = 0;

            for (int index = 1; index < geometry.size(); index++) {
                segmentDistanceM += GeoUtils.distanceM(geometry.get(index - 1), geometry.get(index));
                Long osmNodeId = index < way.nodesOrEmpty().size() ? way.nodesOrEmpty().get(index) : null;
                boolean shouldSplit = index == geometry.size() - 1
                        || (osmNodeId != null && nodeUseCount.getOrDefault(osmNodeId, 0) > 1)
                        || segmentDistanceM >= 280;

                if (segmentDistanceM < 2) continue;
                if (!shouldSplit) continue;

                LatLng fromPoint = geometry.get(segmentStartIndex);
                LatLng toPoint = geometry.get(index);
                String fromId = nodeId(way, segmentStartIndex, fromPoint);
                String toId = nodeId(way, index, toPoint);
                List<LatLng> edgeGeometry = new ArrayList<>(geometry.subList(segmentStartIndex, index + 1));

                nodes.put(fromId, new RouteNode(fromId, fromPoint));
                nodes.put(toId, new RouteNode(toId, toPoint));

                Double fromElev = elevations.get(ElevationService.nodeKey(fromPoint));
                Double toElev = elevations.get(ElevationService.nodeKey(toPoint));
                double elevationGainM = (fromElev != null && toElev != null)
                        ? Math.round((toElev - fromElev) * 10) / 10.0
                        : 0;
                LatLng midpoint = new LatLng((fromPoint.lat() + toPoint.lat()) / 2, (fromPoint.lng() + toPoint.lng()) / 2);
                GreenScores green = greenScores(midpoint, greenFeatures);
                String highway = tags.get("highway");
                double wayParkScore = ("path".equals(highway) || "footway".equals(highway) || "cycleway".equals(highway))
                        ? Math.max(green.park, 0.35) : green.park;
                double scenery = GeoUtils.clamp(0.28 + green.scenery * 0.58 + (tags.containsKey("name") ? 0.08 : 0), 0, 0.98);

                edges.add(RouteEdge.builder()
                        .id("osm-way-" + way.id() + "-" + segmentStartIndex + "-" + index)
                        .from(fromId)
                        .to(toId)
                        .distanceM(Math.round(segmentDistanceM))
                        .geometry(edgeGeometry)
                        .surfaceType(OsmTagging.surfaceType(tags))
                        .roadType(OsmTagging.roadType(tags))
                        .elevationGainM(elevationGainM)
                        .fromAbsElevM(fromElev)
                        .toAbsElevM(toElev)
                        .slope(segmentDistanceM > 0 ? elevationGainM / segmentDistanceM : 0)
                        .parkScore(GeoUtils.clamp(wayParkScore, 0, 0.98))
                        .shadeScore(OsmTagging.shadeScore(tags, green.shade))
                        .safetyScore(OsmTagging.accessAllowed(tags, preferences.activity())
                                ? OsmTagging.safetyScore(tags) : 0.03)
                        .sceneryScore(scenery)
                        .bikeScore(OsmTagging.bikeScore(tags))
                        .walkScore(OsmTagging.walkScore(tags))
                        .accessAllowed(OsmTagging.accessAllowed(tags, preferences.activity()))
                        .noveltyScore(GeoUtils.clamp(0.36 + scenery * 0.38
                                + ("path".equals(highway) ? 0.16 : 0), 0, 0.98))
                        .trafficExposure(OsmTagging.trafficExposure(tags))
                        .accessRestrictions(OsmTagging.accessAllowed(tags, preferences.activity())
                                ? null
                                : List.of(tags.getOrDefault("access", "restricted")))
                        .build());

                segmentStartIndex = index;
                segmentDistanceM = 0;
            }
        }

        return new GraphDraft(new ArrayList<>(nodes.values()), edges);
    }

    /**
     * Trims the raw graph to the local area, keeping only the top {@code maxEdges} edges
     * ranked by quality and proximity.
     *
     * <p>Time complexity: O(E log E) for sorting, O(E) for filtering.
     * Space complexity: O(E) for the scored list.
     */
    public static GraphDraft trimToLocalGraph(
            LatLng startPoint,
            List<RouteNode> nodes,
            List<RouteEdge> edges,
            UserPreferences preferences) {
        double radiusM = graphRadiusKm(preferences) * 1000;
        int maxEdges = preferences.activity() == com.routecraft.api.routing.model.ActivityType.CYCLING ? 14000 : 10000;

        record Scored(RouteEdge edge, double sortKey) {}
        List<Scored> scored = new ArrayList<>();
        for (RouteEdge edge : edges) {
            LatLng mid = midpoint(edge.geometry().get(0), edge.geometry().get(edge.geometry().size() - 1));
            double dist = GeoUtils.distanceM(startPoint, mid);
            if (dist > radiusM) continue;
            double quality = edge.parkScore() + edge.shadeScore() + edge.safetyScore() + edge.sceneryScore();
            scored.add(new Scored(edge, dist - quality * 120));
        }
        scored.sort(Comparator.comparingDouble(Scored::sortKey));
        List<RouteEdge> localEdges = new ArrayList<>(Math.min(maxEdges, scored.size()));
        for (int i = 0; i < Math.min(maxEdges, scored.size()); i++) {
            localEdges.add(scored.get(i).edge);
        }
        Set<String> usedNodeIds = new HashSet<>();
        for (RouteEdge edge : localEdges) {
            usedNodeIds.add(edge.from());
            usedNodeIds.add(edge.to());
        }
        List<RouteNode> usedNodes = new ArrayList<>();
        for (RouteNode node : nodes) {
            if (usedNodeIds.contains(node.id())) usedNodes.add(node);
        }
        return new GraphDraft(usedNodes, localEdges);
    }

    public static List<RouteEdge> applyElevationsToEdges(List<RouteEdge> edges, Map<String, Double> elevations) {
        if (elevations.isEmpty()) return edges;
        List<RouteEdge> result = new ArrayList<>(edges.size());
        for (RouteEdge edge : edges) {
            Double fromElev = elevations.get(ElevationService.nodeKey(edge.geometry().get(0)));
            Double toElev = elevations.get(ElevationService.nodeKey(edge.geometry().get(edge.geometry().size() - 1)));
            if (fromElev == null || toElev == null) {
                result.add(edge);
                continue;
            }
            double elevationGainM = Math.round((toElev - fromElev) * 10) / 10.0;
            result.add(edge.toBuilder()
                    .elevationGainM(elevationGainM)
                    .fromAbsElevM(fromElev)
                    .toAbsElevM(toElev)
                    .slope(edge.distanceM() > 0 ? elevationGainM / edge.distanceM() : 0)
                    .build());
        }
        return result;
    }

    /**
     * Snaps an anchor point (start/end) onto up to 6 nearby edges by linear projection,
     * then splits those edges and connects the anchor via short connector edges.
     *
     * <p>Time complexity: O(E × G) for the projection scan where G = geometry points per edge
     * (typically 2–5). Capped at 6 projections so the resulting graph injection is O(1).
     * Space complexity: O(E) for the ranked list (then pruned to 6).
     */
    public static GraphDraft addAnchorNode(
            String anchorId,
            LatLng point,
            List<RouteNode> nodes,
            List<RouteEdge> edges) {
        if (point == null) {
            return new GraphDraft(nodes, edges);
        }

        RouteNode anchor = new RouteNode(anchorId, point);
        record EdgeProjection(RouteEdge edge, ClosestProjection projection) {}
        List<EdgeProjection> ranked = new ArrayList<>();
        for (RouteEdge edge : edges) {
            if ("connector".equals(edge.roadType())) continue;
            if (edge.geometry().size() < 2) continue;
            ranked.add(new EdgeProjection(edge, closestPointOnEdge(point, edge)));
        }
        ranked.sort(Comparator.comparingDouble(ep -> ep.projection.distanceM));
        if (ranked.size() > 6) {
            ranked = ranked.subList(0, 6);
        }

        List<RouteNode> snapNodes = new ArrayList<>();
        List<RouteEdge> connectorEdges = new ArrayList<>();
        List<RouteEdge> splitEdges = new ArrayList<>();

        for (int i = 0; i < ranked.size(); i++) {
            EdgeProjection ep = ranked.get(i);
            RouteNode snapNode = new RouteNode(anchorId + "-snap-" + i, ep.projection.point);
            snapNodes.add(snapNode);
            connectorEdges.add(createAnchorConnector(anchorId + "-connector-" + i, anchor, snapNode, ep.edge));
            splitEdges.addAll(splitEdgeAtPoint(ep.edge, snapNode, ep.projection.segmentIndex, anchorId + "-" + i));
        }

        List<RouteNode> newNodes = new ArrayList<>(nodes.size() + snapNodes.size() + 1);
        newNodes.add(anchor);
        newNodes.addAll(snapNodes);
        newNodes.addAll(nodes);
        List<RouteEdge> newEdges = new ArrayList<>(edges.size() + connectorEdges.size() + splitEdges.size());
        newEdges.addAll(connectorEdges);
        newEdges.addAll(splitEdges);
        newEdges.addAll(edges);
        return new GraphDraft(newNodes, newEdges);
    }

    private static RouteEdge createAnchorConnector(String id, RouteNode from, RouteNode to, RouteEdge ref) {
        double distanceM = Math.max(1, Math.round(GeoUtils.distanceM(from.point(), to.point())));
        return RouteEdge.builder()
                .id(id)
                .from(from.id())
                .to(to.id())
                .distanceM(distanceM)
                .geometry(List.of(from.point(), to.point()))
                .surfaceType(ref != null ? ref.surfaceType() : "paved")
                .roadType("connector")
                .elevationGainM(0d)
                .slope(0d)
                .parkScore(ref != null ? ref.parkScore() : 0.35)
                .shadeScore(ref != null ? ref.shadeScore() : 0.35)
                .safetyScore(ref != null ? ref.safetyScore() : 0.7)
                .sceneryScore(ref != null ? ref.sceneryScore() : 0.4)
                .bikeScore(ref != null ? ref.bikeScore() : 0.55)
                .walkScore(ref != null ? ref.walkScore() : 0.75)
                .accessAllowed(true)
                .noveltyScore(ref != null ? ref.noveltyScore() : 0.4)
                .trafficExposure(ref != null && ref.trafficExposure() != null ? ref.trafficExposure() : 0.18)
                .build();
    }

    private static List<RouteEdge> splitEdgeAtPoint(RouteEdge edge, RouteNode node, int segmentIndex, String anchorPrefix) {
        List<LatLng> firstGeometry = new ArrayList<>(edge.geometry().subList(0, segmentIndex + 1));
        firstGeometry.add(node.point());
        List<LatLng> secondGeometry = new ArrayList<>();
        secondGeometry.add(node.point());
        secondGeometry.addAll(edge.geometry().subList(segmentIndex + 1, edge.geometry().size()));
        double firstDistanceM = Math.max(1, Math.round(GeoUtils.calculateGeometryDistanceM(firstGeometry)));
        double secondDistanceM = Math.max(1, Math.round(GeoUtils.calculateGeometryDistanceM(secondGeometry)));
        double totalDistanceM = firstDistanceM + secondDistanceM;
        double elevationGainM = edge.elevationGainM() == null ? 0 : edge.elevationGainM();
        double slope = edge.slope() == null ? 0 : edge.slope();

        RouteEdge first = edge.toBuilder()
                .id(anchorPrefix + "-" + edge.id() + "-split-a")
                .to(node.id())
                .distanceM(firstDistanceM)
                .geometry(firstGeometry)
                .elevationGainM(Math.round(elevationGainM * (firstDistanceM / totalDistanceM) * 10) / 10.0)
                .slope(slope)
                .toAbsElevM(null)
                .build();
        RouteEdge second = edge.toBuilder()
                .id(anchorPrefix + "-" + edge.id() + "-split-b")
                .from(node.id())
                .distanceM(secondDistanceM)
                .geometry(secondGeometry)
                .elevationGainM(Math.round(elevationGainM * (secondDistanceM / totalDistanceM) * 10) / 10.0)
                .slope(slope)
                .fromAbsElevM(null)
                .build();
        return List.of(first, second);
    }

    private static String nodeId(OsmElement way, int index, LatLng point) {
        Long osmNodeId = index < way.nodesOrEmpty().size() ? way.nodesOrEmpty().get(index) : null;
        if (osmNodeId != null) return "osm-node-" + osmNodeId;
        return "coord-" + String.format(Locale.ROOT, "%.6f-%.6f", point.lat(), point.lng());
    }

    private static LatLng midpoint(LatLng a, LatLng b) {
        return new LatLng((a.lat() + b.lat()) / 2, (a.lng() + b.lng()) / 2);
    }

    public static double graphRadiusKm(UserPreferences preferences) {
        double targetDistanceKm = GeoUtils.resolveTargetDistanceKm(preferences);
        double activityMultiplier = preferences.activity() == com.routecraft.api.routing.model.ActivityType.CYCLING ? 0.65 : 0.6;
        double maxRadius = preferences.activity() == com.routecraft.api.routing.model.ActivityType.CYCLING ? 20 : 14;
        return GeoUtils.clamp(targetDistanceKm * activityMultiplier + 1.0, 2.5, maxRadius);
    }

    /**
     * Scores an edge midpoint against the nearest green features.
     *
     * <p>Time complexity: O(F × G_f) per edge midpoint, where F = number of green features
     * and G_f = geometry points per feature. Called once per edge during graph construction;
     * results are baked into the edge and never recomputed.
     * Space complexity: O(min(F, 5)) for the hit list.
     */
    private static GreenScores greenScores(LatLng point, List<GreenFeature> features) {
        record Hit(GreenFeature feature, double distanceM) {}
        List<Hit> hits = new ArrayList<>();
        for (GreenFeature feature : features) {
            hits.add(new Hit(feature, featureDistanceM(point, feature)));
        }
        hits.sort(Comparator.comparingDouble(Hit::distanceM));
        if (hits.size() > 5) hits = hits.subList(0, 5);

        double park = 0, shade = 0, scenery = 0;
        for (Hit hit : hits) {
            double proximity = GeoUtils.clamp(1 - hit.distanceM / 300, 0, 1);
            double parkBoost = (hit.feature.kind() == OsmTagging.GreenKind.PARK
                    || hit.feature.kind() == OsmTagging.GreenKind.WOODS) ? proximity : proximity * 0.45;
            double shadeBoost = hit.feature.kind() == OsmTagging.GreenKind.WOODS ? proximity
                    : (hit.feature.kind() == OsmTagging.GreenKind.PARK ? proximity * 0.72 : proximity * 0.28);
            double sceneryBoost = hit.feature.kind() == OsmTagging.GreenKind.WATER ? proximity : proximity * 0.82;
            park = Math.max(park, parkBoost);
            shade = Math.max(shade, shadeBoost);
            scenery = Math.max(scenery, sceneryBoost);
        }
        return new GreenScores(park, shade, scenery);
    }

    private static double featureDistanceM(LatLng point, GreenFeature feature) {
        List<LatLng> geometry = feature.geometry();
        if (geometry.size() > 3
                && GeoUtils.distanceM(geometry.get(0), geometry.get(geometry.size() - 1)) < 8
                && pointInPolygon(point, geometry)) {
            return 0;
        }
        double closest = Double.POSITIVE_INFINITY;
        for (int i = 1; i < geometry.size(); i++) {
            double d = pointToSegmentDistanceM(point, geometry.get(i - 1), geometry.get(i));
            if (d < closest) closest = d;
        }
        return closest;
    }

    private static boolean pointInPolygon(LatLng point, List<LatLng> polygon) {
        boolean inside = false;
        int n = polygon.size();
        for (int current = 0, previous = n - 1; current < n; previous = current++) {
            LatLng cp = polygon.get(current);
            LatLng pp = polygon.get(previous);
            boolean intersects = (cp.lng() > point.lng()) != (pp.lng() > point.lng())
                    && point.lat() < ((pp.lat() - cp.lat()) * (point.lng() - cp.lng())
                            / (pp.lng() - cp.lng()) + cp.lat());
            if (intersects) inside = !inside;
        }
        return inside;
    }

    private static double pointToSegmentDistanceM(LatLng point, LatLng start, LatLng end) {
        double[] startVec = projectedOffsetM(point, start);
        double[] endVec = projectedOffsetM(point, end);
        double sx = endVec[0] - startVec[0];
        double sy = endVec[1] - startVec[1];
        double lenSq = sx * sx + sy * sy;
        if (lenSq == 0) return GeoUtils.distanceM(point, start);
        double projection = GeoUtils.clamp(
                -(startVec[0] * sx + startVec[1] * sy) / lenSq, 0, 1);
        double dx = startVec[0] + sx * projection;
        double dy = startVec[1] + sy * projection;
        return Math.hypot(dx, dy);
    }

    private static ClosestProjection closestPointOnSegment(LatLng point, LatLng start, LatLng end) {
        double[] startVec = projectedOffsetM(point, start);
        double[] endVec = projectedOffsetM(point, end);
        double sx = endVec[0] - startVec[0];
        double sy = endVec[1] - startVec[1];
        double lenSq = sx * sx + sy * sy;
        if (lenSq == 0) {
            return new ClosestProjection(start, GeoUtils.distanceM(point, start), 0, 0);
        }
        double position = GeoUtils.clamp(
                -(startVec[0] * sx + startVec[1] * sy) / lenSq, 0, 1);
        LatLng projected = new LatLng(
                start.lat() + (end.lat() - start.lat()) * position,
                start.lng() + (end.lng() - start.lng()) * position);
        double dx = startVec[0] + sx * position;
        double dy = startVec[1] + sy * position;
        return new ClosestProjection(projected, Math.hypot(dx, dy), position, 0);
    }

    private static ClosestProjection closestPointOnEdge(LatLng point, RouteEdge edge) {
        ClosestProjection best = new ClosestProjection(edge.geometry().get(0), Double.POSITIVE_INFINITY, 0, 0);
        for (int i = 1; i < edge.geometry().size(); i++) {
            ClosestProjection candidate = closestPointOnSegment(point, edge.geometry().get(i - 1), edge.geometry().get(i));
            if (candidate.distanceM < best.distanceM) {
                best = new ClosestProjection(candidate.point, candidate.distanceM, candidate.position, i - 1);
            }
        }
        return best;
    }

    private static double[] projectedOffsetM(LatLng origin, LatLng point) {
        double x = ((point.lng() - origin.lng()) * Math.PI * 6371000.0
                * Math.cos((origin.lat() * Math.PI) / 180.0)) / 180.0;
        double y = ((point.lat() - origin.lat()) * Math.PI * 6371000.0) / 180.0;
        return new double[]{x, y};
    }

    public record GraphDraft(List<RouteNode> nodes, List<RouteEdge> edges) {
    }

    record ClosestProjection(LatLng point, double distanceM, double position, int segmentIndex) {
    }

    private record GreenScores(double park, double shade, double scenery) {
    }
}
