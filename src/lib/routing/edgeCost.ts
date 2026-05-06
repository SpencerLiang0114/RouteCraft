import type { UserPreferences } from "@/types/route";
import type { RouteEdge } from "./graph";
import { isAfternoonDeparture, isNightDeparture, normalizePreference } from "./geoUtils";

const SURFACE_PENALTIES: Record<string, number> = {
  gravel: 0.08,
  dirt: 0.04,
  rough_trail: 0.16,
  sidewalk: -0.04,
  paved: -0.03,
};

const ROAD_PENALTIES: Record<string, number> = {
  highway: 1.9,
  arterial: 0.75,
  collector: 0.28,
  residential: -0.03,
  greenway: -0.22,
  park_path: -0.18,
  trail: -0.14,
  bike_path: -0.24,
};

function wantsClimbing(preferences: UserPreferences) {
  return preferences.routeStyle === "climbing";
}

export function computeEdgeCost(edge: RouteEdge, preferences: UserPreferences) {
  if (!edge.accessAllowed) {
    return Number.POSITIVE_INFINITY;
  }

  const parkPreference = normalizePreference(preferences.parkPreference);
  const shadePreference = normalizePreference(preferences.shadePreference);
  const elevationPreference = normalizePreference(preferences.elevationPreference);
  const safetyPreference = normalizePreference(preferences.safetyPreference);
  const explorationPreference = normalizePreference(preferences.explorationPreference);
  const distance = edge.distanceM;
  const elevationGain = edge.elevationGainM ?? 0;
  const slope = Math.abs(edge.slope ?? 0);
  let cost = distance;

  if (wantsClimbing(preferences)) {
    cost -= Math.min(distance * 0.24, elevationPreference * elevationGain * 1.6);
    cost += slope > 0.12 ? distance * slope * 2.2 : 0;
  } else {
    cost += elevationPreference * elevationGain * 4.5;
    cost += elevationPreference * slope * distance * 1.8;
  }

  cost += safetyPreference * (1 - edge.safetyScore) * distance * 1.15;
  cost += shadePreference * (1 - edge.shadeScore) * distance * 0.42;
  cost -= parkPreference * edge.parkScore * distance * 0.32;
  cost -= explorationPreference * (edge.noveltyScore ?? edge.sceneryScore) * distance * 0.24;
  cost -= edge.sceneryScore * distance * 0.08;

  if (isAfternoonDeparture(preferences.departureTime)) {
    cost += shadePreference * (1 - edge.shadeScore) * distance * 0.28;
  }

  if (isNightDeparture(preferences.departureTime)) {
    cost += (1 - edge.safetyScore) * distance * 0.35;
    cost += (edge.trafficExposure ?? 0.25) * distance * 0.18;
  }

  if (preferences.activity === "cycling") {
    cost -= edge.bikeScore * distance * 0.32;
    cost += (1 - edge.bikeScore) * distance * 0.48;
    cost += slope > 0.08 ? distance * slope * 3.8 : 0;
  } else {
    cost -= edge.walkScore * distance * 0.24;
    cost += (1 - edge.walkScore) * distance * 0.32;
  }

  if (preferences.activity === "hiking") {
    cost -= (edge.roadType === "trail" || edge.roadType === "park_path" ? 0.28 : 0) * distance;
    cost += edge.roadType === "arterial" ? distance * 0.28 : 0;
  }

  cost += (ROAD_PENALTIES[edge.roadType ?? ""] ?? 0) * distance;
  cost += (SURFACE_PENALTIES[edge.surfaceType ?? ""] ?? 0) * distance;
  cost += (edge.trafficExposure ?? 0) * safetyPreference * distance * 0.38;

  return Math.max(cost, distance * 0.2);
}
