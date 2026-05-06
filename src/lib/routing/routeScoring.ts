import type { ActivityType, RouteCandidate, RouteMetrics, UserPreferences } from "@/types/route";
import { normalizePreference } from "./geoUtils";

type ScoreWeights = Omit<RouteMetrics, "totalScore">;

const baseWeights: ScoreWeights = {
  distanceScore: 0.2,
  elevationScore: 0.2,
  parkScore: 0.15,
  shadeScore: 0.15,
  safetyScore: 0.15,
  explorationScore: 0.1,
  sceneryScore: 0.05,
};

const activityAdjustments: Record<ActivityType, Partial<ScoreWeights>> = {
  running: {
    distanceScore: 0.23,
    elevationScore: 0.15,
    parkScore: 0.16,
    safetyScore: 0.2,
  },
  hiking: {
    distanceScore: 0.13,
    elevationScore: 0.18,
    explorationScore: 0.12,
    sceneryScore: 0.16,
  },
  cycling: {
    distanceScore: 0.18,
    elevationScore: 0.14,
    parkScore: 0.08,
    shadeScore: 0.08,
    safetyScore: 0.28,
  },
};

function normalizeWeights(weights: ScoreWeights) {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);

  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, value / total]),
  ) as ScoreWeights;
}

function getWeights(preferences: UserPreferences): ScoreWeights {
  const weights = {
    ...baseWeights,
    ...activityAdjustments[preferences.activity],
  };

  weights.parkScore += normalizePreference(preferences.parkPreference) * 0.05;
  weights.shadeScore += normalizePreference(preferences.shadePreference) * 0.05;
  weights.safetyScore += normalizePreference(preferences.safetyPreference) * 0.06;
  weights.explorationScore += normalizePreference(preferences.explorationPreference) * 0.05;
  weights.elevationScore += normalizePreference(preferences.elevationPreference) * 0.04;

  return normalizeWeights(weights);
}

export function scoreRoute(
  route: Pick<RouteCandidate, "metrics" | "activity">,
  preferences: UserPreferences,
) {
  const weights = getWeights(preferences);
  const metrics = route.metrics;

  return Math.round(
    Object.entries(weights).reduce((score, [key, weight]) => {
      return score + metrics[key as keyof ScoreWeights] * weight;
    }, 0),
  );
}
