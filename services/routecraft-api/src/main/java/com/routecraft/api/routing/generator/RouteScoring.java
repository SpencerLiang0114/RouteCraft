package com.routecraft.api.routing.generator;

import java.util.EnumMap;
import java.util.Map;

import com.routecraft.api.routing.graph.GeoUtils;
import com.routecraft.api.routing.model.ActivityType;
import com.routecraft.api.routing.model.RouteMetrics;
import com.routecraft.api.routing.model.UserPreferences;

public final class RouteScoring {

    private enum Component {
        DISTANCE, ELEVATION, PARK, SHADE, SAFETY, EXPLORATION, SCENERY
    }

    private static final EnumMap<Component, Double> BASE_WEIGHTS = new EnumMap<>(Component.class);
    static {
        BASE_WEIGHTS.put(Component.DISTANCE, 0.20);
        BASE_WEIGHTS.put(Component.ELEVATION, 0.20);
        BASE_WEIGHTS.put(Component.PARK, 0.15);
        BASE_WEIGHTS.put(Component.SHADE, 0.15);
        BASE_WEIGHTS.put(Component.SAFETY, 0.15);
        BASE_WEIGHTS.put(Component.EXPLORATION, 0.10);
        BASE_WEIGHTS.put(Component.SCENERY, 0.05);
    }

    private static final Map<ActivityType, EnumMap<Component, Double>> ACTIVITY_OVERRIDES = Map.of(
            ActivityType.RUNNING, overrides(Map.of(
                    Component.DISTANCE, 0.23,
                    Component.ELEVATION, 0.15,
                    Component.PARK, 0.16,
                    Component.SAFETY, 0.20)),
            ActivityType.HIKING, overrides(Map.of(
                    Component.DISTANCE, 0.13,
                    Component.ELEVATION, 0.18,
                    Component.EXPLORATION, 0.12,
                    Component.SCENERY, 0.16)),
            ActivityType.CYCLING, overrides(Map.of(
                    Component.DISTANCE, 0.18,
                    Component.ELEVATION, 0.14,
                    Component.PARK, 0.08,
                    Component.SHADE, 0.08,
                    Component.SAFETY, 0.28)));

    private static EnumMap<Component, Double> overrides(Map<Component, Double> values) {
        EnumMap<Component, Double> result = new EnumMap<>(Component.class);
        result.putAll(values);
        return result;
    }

    private RouteScoring() {
    }

    public static int scoreRoute(RouteMetrics metrics, UserPreferences preferences) {
        EnumMap<Component, Double> weights = computeWeights(preferences);
        double score = 0;
        score += weights.get(Component.DISTANCE) * metrics.distanceScore();
        score += weights.get(Component.ELEVATION) * metrics.elevationScore();
        score += weights.get(Component.PARK) * metrics.parkScore();
        score += weights.get(Component.SHADE) * metrics.shadeScore();
        score += weights.get(Component.SAFETY) * metrics.safetyScore();
        score += weights.get(Component.EXPLORATION) * metrics.explorationScore();
        score += weights.get(Component.SCENERY) * metrics.sceneryScore();
        return (int) Math.round(score);
    }

    private static EnumMap<Component, Double> computeWeights(UserPreferences preferences) {
        EnumMap<Component, Double> weights = new EnumMap<>(Component.class);
        weights.putAll(BASE_WEIGHTS);
        EnumMap<Component, Double> overrides = ACTIVITY_OVERRIDES.get(preferences.activity());
        if (overrides != null) {
            weights.putAll(overrides);
        }
        weights.merge(Component.PARK,
                GeoUtils.normalizePreference(preferences.parkPreference()) * 0.05, Double::sum);
        weights.merge(Component.SHADE,
                GeoUtils.normalizePreference(preferences.shadePreference()) * 0.05, Double::sum);
        weights.merge(Component.SAFETY,
                GeoUtils.normalizePreference(preferences.safetyPreference()) * 0.06, Double::sum);
        weights.merge(Component.EXPLORATION,
                GeoUtils.normalizePreference(preferences.explorationPreference()) * 0.05, Double::sum);
        weights.merge(Component.ELEVATION,
                GeoUtils.normalizePreference(preferences.elevationPreference()) * 0.04, Double::sum);

        double total = 0;
        for (double v : weights.values()) {
            total += v;
        }
        if (total > 0) {
            for (Component c : weights.keySet()) {
                weights.put(c, weights.get(c) / total);
            }
        }
        return weights;
    }
}
