package com.routecraft.api.routing.generator;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.function.ToDoubleFunction;

import com.routecraft.api.routing.graph.GeoUtils;
import com.routecraft.api.routing.graph.RouteEdge;
import com.routecraft.api.routing.model.ActivityType;
import com.routecraft.api.routing.model.Difficulty;
import com.routecraft.api.routing.model.ElevationPoint;
import com.routecraft.api.routing.model.LatLng;
import com.routecraft.api.routing.model.RouteCandidate;
import com.routecraft.api.routing.model.RouteMetrics;
import com.routecraft.api.routing.model.RouteSource;
import com.routecraft.api.routing.model.RouteStyle;
import com.routecraft.api.routing.model.UserPreferences;

public final class RouteAnalyzer {

    private RouteAnalyzer() {
    }

    public static GeneratedRouteCandidate buildRouteCandidate(RouteDraft draft, UserPreferences preferences) {
        RouteMetrics metrics = analyzeRoute(draft, preferences);
        double distanceKm = GeoUtils.round(draft.path().distanceM() / 1000.0, 1);
        ElevationData elev = buildElevationData(draft.path().edges());
        double maxSlopePct = Math.round(maxAbsSlope(draft.path().edges()) * 100 * 10) / 10.0;
        double geometryDistanceM = GeoUtils.calculateGeometryDistanceM(draft.path().geometry());
        Double averageSlopePct = geometryDistanceM > 0
                ? Math.round((elev.elevationGainM / geometryDistanceM) * 1000.0) / 10.0
                : null;
        Difficulty difficulty = getDifficulty(draft.activity(), distanceKm, elev.elevationGainM, maxSlopePct);
        String explanation = buildExplanation(preferences, metrics);

        List<String> edgeIds = new ArrayList<>(draft.path().edges().size());
        for (RouteEdge edge : draft.path().edges()) {
            edgeIds.add(edge.undirectedKey());
        }

        RouteCandidate candidate = new RouteCandidate(
                draft.id(),
                RouteSource.GENERATED,
                draft.name(),
                draft.activity(),
                draft.routeType(),
                draft.path().geometry(),
                draft.waypoints(),
                distanceKm,
                GeoUtils.estimateDurationMin(draft.activity(), distanceKm),
                elev.elevationGainM,
                elev.totalDescentM,
                averageSlopePct,
                maxSlopePct,
                elev.lowestElevM,
                elev.highestElevM,
                elev.elevDifferenceM,
                elev.profile,
                difficulty,
                metrics,
                explanation);

        return new GeneratedRouteCandidate(candidate, edgeIds, draft.path().edges(), draft.strategy());
    }

    public static RouteMetrics analyzeRoute(RouteDraft draft, UserPreferences preferences) {
        List<RouteEdge> edges = draft.path().edges();
        double targetDistanceKm = GeoUtils.resolveTargetDistanceKm(preferences);
        double distanceKm = GeoUtils.round(draft.path().distanceM() / 1000.0, 1);
        double elevationGainM = 0;
        for (RouteEdge edge : edges) {
            elevationGainM += Math.max(edge.elevationGainM() == null ? 0 : edge.elevationGainM(), 0);
        }
        elevationGainM = Math.round(elevationGainM);
        double maxSlopePct = maxAbsSlope(edges) * 100;

        double referenceOverlap = getReferenceOverlap(edges, draft.referenceEdgeIds());
        double shadePenalty = GeoUtils.isAfternoonDeparture(preferences.departureTime()) ? 8 : 0;
        double nightSafetyPenalty = GeoUtils.isNightDeparture(preferences.departureTime()) ? 8 : 0;

        double avgPark = edgeAverage(edges, RouteEdge::parkScore);
        double avgShade = edgeAverage(edges, RouteEdge::shadeScore);
        double avgSafety = edgeAverage(edges, RouteEdge::safetyScore);
        double avgScenery = edgeAverage(edges, RouteEdge::sceneryScore);
        double avgNovelty = edgeAverage(edges, e -> e.noveltyScore() == null ? e.sceneryScore() : e.noveltyScore());
        double avgTraffic = edgeAverage(edges, e -> e.trafficExposure() == null ? 0.2 : e.trafficExposure());

        double distanceScore = scoreDistance(distanceKm, targetDistanceKm);
        double elevationScore = scoreElevation(preferences.activity(), distanceKm, elevationGainM, maxSlopePct, preferences);
        double parkScore = clamp(avgPark * 100, 0, 100);
        double shadeScore = clamp(avgShade * 100 - shadePenalty * (1 - avgShade), 0, 100);
        double safetyScore = clamp(avgSafety * 100 - nightSafetyPenalty - avgTraffic * 9, 0, 100);
        double explorationScore = clamp(avgNovelty * 70 + (1 - referenceOverlap) * 30, 0, 100);
        double sceneryScore = clamp(avgScenery * 100, 0, 100);

        RouteMetrics partial = new RouteMetrics(
                parkScore, shadeScore, safetyScore, explorationScore, sceneryScore,
                elevationScore, distanceScore, 0);
        int totalScore = RouteScoring.scoreRoute(partial, preferences);

        return new RouteMetrics(parkScore, shadeScore, safetyScore, explorationScore, sceneryScore,
                elevationScore, distanceScore, totalScore);
    }

    private static double maxAbsSlope(List<RouteEdge> edges) {
        double max = 0;
        for (RouteEdge edge : edges) {
            double slope = Math.abs(edge.slope() == null ? 0 : edge.slope());
            if (slope > max) {
                max = slope;
            }
        }
        return max;
    }

    private static double edgeAverage(List<RouteEdge> edges, ToDoubleFunction<RouteEdge> selector) {
        List<double[]> entries = new ArrayList<>(edges.size());
        for (RouteEdge edge : edges) {
            entries.add(new double[]{ selector.applyAsDouble(edge), Math.max(edge.distanceM(), 1) });
        }
        return GeoUtils.weightedAverage(entries, 0.5);
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private static double scoreDistance(double distanceKm, double targetDistanceKm) {
        double miss = Math.abs(distanceKm - targetDistanceKm) / Math.max(targetDistanceKm, 0.1);
        return clamp(100 - miss * 160, 0, 100);
    }

    private static double scoreElevation(
            ActivityType activity,
            double distanceKm,
            double elevationGainM,
            double maxSlopePct,
            UserPreferences preferences) {
        double gainPerKm = elevationGainM / Math.max(distanceKm, 0.1);
        double elevationPreference = GeoUtils.normalizePreference(preferences.elevationPreference());

        if (GeoUtils.wantsClimbing(preferences)) {
            double targetGainPerKm = activity == ActivityType.CYCLING
                    ? 14 + elevationPreference * 12
                    : 22 + elevationPreference * 34;
            double slopePenalty = Math.max(0, maxSlopePct - (activity == ActivityType.CYCLING ? 8 : 14)) * 4;
            return clamp(100 - Math.abs(gainPerKm - targetGainPerKm) * 1.25 - slopePenalty, 0, 100);
        }

        double slopePenalty = Math.max(0, maxSlopePct - (activity == ActivityType.CYCLING ? 7 : 11)) * 3.5;
        double gainPenalty = gainPerKm * (activity == ActivityType.CYCLING ? 1.2 : 1.05);
        return clamp(100 - gainPenalty * (0.65 + elevationPreference * 0.75) - slopePenalty, 0, 100);
    }

    private static double getReferenceOverlap(List<RouteEdge> edges, Set<String> referenceEdgeIds) {
        if (referenceEdgeIds == null || referenceEdgeIds.isEmpty()) {
            return 0;
        }
        double sharedDistance = 0;
        double totalDistance = 0;
        for (RouteEdge edge : edges) {
            if (referenceEdgeIds.contains(edge.undirectedKey())) {
                sharedDistance += edge.distanceM();
            }
            totalDistance += edge.distanceM();
        }
        return totalDistance > 0 ? sharedDistance / totalDistance : 0;
    }

    private static Difficulty getDifficulty(
            ActivityType activity,
            double distanceKm,
            double elevationGainM,
            double maxSlopePct) {
        double gainPerKm = elevationGainM / Math.max(distanceKm, 0.1);
        double effort = distanceKm * (activity == ActivityType.CYCLING ? 0.35 : 1)
                + gainPerKm * 0.18 + maxSlopePct * 0.18;
        if (effort > (activity == ActivityType.HIKING ? 18 : 13)) {
            return Difficulty.HARD;
        }
        if (effort > (activity == ActivityType.CYCLING ? 8 : 7)) {
            return Difficulty.MODERATE;
        }
        return Difficulty.EASY;
    }

    private static String buildExplanation(UserPreferences preferences, RouteMetrics metrics) {
        List<String> reasons = new ArrayList<>();
        if (metrics.parkScore() >= 70) reasons.add("uses park paths and green corridors");
        if (metrics.elevationScore() >= 78 && preferences.routeStyle() != RouteStyle.CLIMBING) {
            reasons.add("keeps elevation controlled");
        }
        if (metrics.elevationScore() >= 78 && preferences.routeStyle() == RouteStyle.CLIMBING) {
            reasons.add("adds a measured climbing profile");
        }
        if (metrics.shadeScore() >= 70) reasons.add("prioritizes shade");
        if (metrics.safetyScore() >= 76) reasons.add("avoids higher-stress road segments");
        if (metrics.explorationScore() >= 72) reasons.add("adds legal alternative paths for novelty");
        if (metrics.sceneryScore() >= 74) reasons.add("includes scenic segments");

        String departureNote = GeoUtils.isAfternoonDeparture(preferences.departureTime()) && metrics.shadeScore() >= 65
                ? " during your selected afternoon departure time"
                : "";

        if (reasons.isEmpty()) {
            return "Balances distance, safety, surface quality, and outdoor appeal for your "
                    + preferences.activity().value() + ".";
        }

        List<String> top = reasons.subList(0, Math.min(4, reasons.size()));
        String lead = top.get(0);
        lead = Character.toUpperCase(lead.charAt(0)) + lead.substring(1);
        StringBuilder body = new StringBuilder(lead);
        for (int i = 1; i < top.size(); i++) {
            body.append(", ").append(top.get(i));
        }
        return body.toString() + departureNote + ".";
    }

    private static ElevationData buildElevationData(List<RouteEdge> edges) {
        boolean hasAbsoluteElevation = edges.stream().anyMatch(e -> e.fromAbsElevM() != null);
        boolean hasAnyElevationData = hasAbsoluteElevation
                || edges.stream().anyMatch(e -> e.elevationGainM() != null && e.elevationGainM() != 0);

        double startAbsElev = 0;
        if (hasAbsoluteElevation) {
            for (RouteEdge edge : edges) {
                if (edge.fromAbsElevM() != null) {
                    startAbsElev = edge.fromAbsElevM();
                    break;
                }
            }
        }

        List<RawPoint> raw = new ArrayList<>();
        raw.add(new RawPoint(0, Math.round(startAbsElev), hasAbsoluteElevation));
        double accDistM = 0;
        double accElevM = startAbsElev;
        for (RouteEdge edge : edges) {
            accDistM += edge.distanceM();
            boolean real;
            if (hasAbsoluteElevation && edge.toAbsElevM() != null) {
                accElevM = edge.toAbsElevM();
                real = true;
            } else {
                accElevM += netElevChange(edge, hasAbsoluteElevation, hasAnyElevationData);
                real = false;
            }
            raw.add(new RawPoint(Math.round(accDistM / 10) / 100.0, Math.round(accElevM), real));
        }

        // Linear interpolation between real anchors when absolute elevation is available
        if (hasAbsoluteElevation) {
            List<Integer> realIdx = new ArrayList<>();
            for (int i = 0; i < raw.size(); i++) {
                if (raw.get(i).real) realIdx.add(i);
            }
            for (int r = 0; r + 1 < realIdx.size(); r++) {
                int lo = realIdx.get(r);
                int hi = realIdx.get(r + 1);
                double fromElev = raw.get(lo).elevM;
                double toElev = raw.get(hi).elevM;
                double span = raw.get(hi).distanceKm - raw.get(lo).distanceKm;
                for (int j = lo + 1; j < hi; j++) {
                    double t = span > 0 ? (raw.get(j).distanceKm - raw.get(lo).distanceKm) / span : 0;
                    raw.set(j, new RawPoint(raw.get(j).distanceKm,
                            Math.round(fromElev + t * (toElev - fromElev)), false));
                }
            }
            if (!realIdx.isEmpty()) {
                int last = realIdx.get(realIdx.size() - 1);
                double lastElev = raw.get(last).elevM;
                for (int j = last + 1; j < raw.size(); j++) {
                    raw.set(j, new RawPoint(raw.get(j).distanceKm, lastElev, false));
                }
            }
        }

        List<ElevationPoint> profile = new ArrayList<>(raw.size());
        for (RawPoint rp : raw) {
            profile.add(new ElevationPoint(rp.distanceKm, rp.elevM));
        }
        double lowest = profile.stream().mapToDouble(ElevationPoint::elevM).min().orElse(0);
        double highest = profile.stream().mapToDouble(ElevationPoint::elevM).max().orElse(0);
        double gain = 0;
        double descent = 0;
        for (int i = 1; i < profile.size(); i++) {
            double diff = profile.get(i).elevM() - profile.get(i - 1).elevM();
            if (diff > 0) gain += diff;
            else descent -= diff;
        }
        return new ElevationData(profile,
                Math.round(gain),
                Math.round(descent),
                Math.round(lowest),
                Math.round(highest),
                Math.round(highest - lowest));
    }

    private static double netElevChange(RouteEdge edge, boolean hasAbsoluteElevation, boolean hasAnyElevationData) {
        if (hasAbsoluteElevation) {
            if (edge.fromAbsElevM() != null && edge.toAbsElevM() != null) {
                return edge.toAbsElevM() - edge.fromAbsElevM();
            }
            return edge.elevationGainM() == null ? 0 : edge.elevationGainM();
        }
        if (hasAnyElevationData) {
            return edge.elevationGainM() == null ? 0 : edge.elevationGainM();
        }
        return estimatedEdgeElevation(edge);
    }

    private static double estimatedEdgeElevation(RouteEdge edge) {
        if (edge.geometry().size() < 2) {
            return 0;
        }
        LatLng from = edge.geometry().get(0);
        LatLng to = edge.geometry().get(edge.geometry().size() - 1);
        double bearing = GeoUtils.bearingDegrees(from, to);
        double uphillBias = Math.cos((bearing * Math.PI) / 180) * 0.018
                + Math.sin((bearing * Math.PI) / 180) * 0.01;
        return edge.distanceM() * uphillBias;
    }

    private record RawPoint(double distanceKm, double elevM, boolean real) {
    }

    public record ElevationData(
            List<ElevationPoint> profile,
            double elevationGainM,
            double totalDescentM,
            double lowestElevM,
            double highestElevM,
            double elevDifferenceM) {
    }

    public static List<GeneratedRouteCandidate> sortByTotalScoreDescending(List<GeneratedRouteCandidate> routes) {
        List<GeneratedRouteCandidate> sorted = new ArrayList<>(routes);
        sorted.sort(Comparator.comparingDouble((GeneratedRouteCandidate r) -> r.candidate().metrics().totalScore()).reversed());
        return sorted;
    }
}
