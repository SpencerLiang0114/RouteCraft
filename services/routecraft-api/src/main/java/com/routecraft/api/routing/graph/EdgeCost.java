package com.routecraft.api.routing.graph;

import java.util.Map;

import com.routecraft.api.routing.model.RouteStyle;
import com.routecraft.api.routing.model.UserPreferences;

public final class EdgeCost {

    private static final Map<String, Double> SURFACE_PENALTIES = Map.of(
            "gravel", 0.08,
            "dirt", 0.04,
            "rough_trail", 0.16,
            "sidewalk", -0.04,
            "paved", -0.03);

    private static final Map<String, Double> ROAD_PENALTIES = Map.ofEntries(
            Map.entry("highway", 1.9),
            Map.entry("arterial", 0.75),
            Map.entry("collector", 0.28),
            Map.entry("residential", -0.03),
            Map.entry("greenway", -0.22),
            Map.entry("park_path", -0.18),
            Map.entry("trail", -0.14),
            Map.entry("bike_path", -0.24));

    private EdgeCost() {
    }

    public static double compute(RouteEdge edge, UserPreferences preferences) {
        if (!edge.accessAllowed()) {
            return Double.POSITIVE_INFINITY;
        }

        double parkPreference = GeoUtils.normalizePreference(preferences.parkPreference());
        double shadePreference = GeoUtils.normalizePreference(preferences.shadePreference());
        double elevationPreference = GeoUtils.normalizePreference(preferences.elevationPreference());
        double safetyPreference = GeoUtils.normalizePreference(preferences.safetyPreference());
        double explorationPreference = GeoUtils.normalizePreference(preferences.explorationPreference());
        double distance = edge.distanceM();
        double elevationGain = edge.elevationGainM() == null ? 0 : edge.elevationGainM();
        double slope = Math.abs(edge.slope() == null ? 0 : edge.slope());
        double cost = distance;

        boolean climbing = GeoUtils.wantsClimbing(preferences);
        if (climbing) {
            cost -= Math.min(distance * 0.24, elevationPreference * elevationGain * 1.6);
            cost += slope > 0.12 ? distance * slope * 2.2 : 0;
        } else {
            cost += elevationPreference * elevationGain * 4.5;
            cost += elevationPreference * slope * distance * 1.8;
        }

        RouteStyle style = preferences.routeStyle();
        if (style == RouteStyle.EASY_FLAT) {
            cost += elevationGain * 3.5;
            cost += slope * distance * 2.5;
        } else if (style == RouteStyle.PARK_HEAVY) {
            cost -= edge.parkScore() * distance * 0.28;
        } else if (style == RouteStyle.SHADED) {
            cost -= edge.shadeScore() * distance * 0.35;
        } else if (style == RouteStyle.SCENIC) {
            cost -= edge.sceneryScore() * distance * 0.28;
        } else if (style == RouteStyle.EXPLORATION) {
            double novelty = edge.noveltyScore() == null ? edge.sceneryScore() : edge.noveltyScore();
            cost -= novelty * distance * 0.28;
        }

        cost += safetyPreference * (1 - edge.safetyScore()) * distance * 1.15;
        cost += shadePreference * (1 - edge.shadeScore()) * distance * 0.42;
        cost -= parkPreference * edge.parkScore() * distance * 0.32;
        double novelty = edge.noveltyScore() == null ? edge.sceneryScore() : edge.noveltyScore();
        cost -= explorationPreference * novelty * distance * 0.24;
        cost -= edge.sceneryScore() * distance * 0.08;

        if (GeoUtils.isAfternoonDeparture(preferences.departureTime())) {
            cost += shadePreference * (1 - edge.shadeScore()) * distance * 0.28;
        }

        if (GeoUtils.isNightDeparture(preferences.departureTime())) {
            cost += (1 - edge.safetyScore()) * distance * 0.35;
            double trafficExposure = edge.trafficExposure() == null ? 0.25 : edge.trafficExposure();
            cost += trafficExposure * distance * 0.18;
        }

        if (preferences.activity() == com.routecraft.api.routing.model.ActivityType.CYCLING) {
            cost -= edge.bikeScore() * distance * 0.32;
            cost += (1 - edge.bikeScore()) * distance * 0.48;
            cost += slope > 0.08 ? distance * slope * 3.8 : 0;
        } else {
            cost -= edge.walkScore() * distance * 0.24;
            cost += (1 - edge.walkScore()) * distance * 0.32;
        }

        if (preferences.activity() == com.routecraft.api.routing.model.ActivityType.HIKING) {
            String roadType = edge.roadType();
            cost -= ("trail".equals(roadType) || "park_path".equals(roadType) ? 0.28 : 0) * distance;
            cost += "arterial".equals(roadType) ? distance * 0.28 : 0;
        }

        Double roadPenalty = edge.roadType() == null ? null : ROAD_PENALTIES.get(edge.roadType());
        cost += (roadPenalty == null ? 0 : roadPenalty) * distance;
        Double surfacePenalty = edge.surfaceType() == null ? null : SURFACE_PENALTIES.get(edge.surfaceType());
        cost += (surfacePenalty == null ? 0 : surfacePenalty) * distance;
        double trafficExposure = edge.trafficExposure() == null ? 0 : edge.trafficExposure();
        cost += trafficExposure * safetyPreference * distance * 0.38;

        return Math.max(cost, distance * 0.2);
    }
}
