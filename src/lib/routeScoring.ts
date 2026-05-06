import type { ActivityType, RouteMetrics } from "@/types/route";

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

const activityWeights: Record<ActivityType, ScoreWeights> = {
  running: {
    ...baseWeights,
    distanceScore: 0.23,
    elevationScore: 0.16,
    parkScore: 0.17,
    shadeScore: 0.13,
    safetyScore: 0.19,
    explorationScore: 0.06,
    sceneryScore: 0.06,
  },
  hiking: {
    ...baseWeights,
    distanceScore: 0.12,
    elevationScore: 0.18,
    parkScore: 0.15,
    shadeScore: 0.12,
    safetyScore: 0.16,
    explorationScore: 0.1,
    sceneryScore: 0.17,
  },
  cycling: {
    ...baseWeights,
    distanceScore: 0.19,
    elevationScore: 0.15,
    parkScore: 0.09,
    shadeScore: 0.08,
    safetyScore: 0.25,
    explorationScore: 0.07,
    sceneryScore: 0.07,
  },
};

export function calculateTotalScore(
  activity: ActivityType,
  scores: Omit<RouteMetrics, "totalScore">,
) {
  const weights = activityWeights[activity];

  return Math.round(
    Object.entries(weights).reduce((total, [key, weight]) => {
      return total + scores[key as keyof ScoreWeights] * weight;
    }, 0),
  );
}
