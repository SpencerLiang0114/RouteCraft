import type {
  ActivityType,
  Difficulty,
  LatLng,
  RouteCandidate,
  RouteMetrics,
  RouteType,
  UserPreferences,
} from "@/types/route";
import { estimateDurationMin, round } from "@/lib/geoUtils";
import type { PathResult, RouteEdge } from "./graph";
import { getEdgeKey } from "./graph";
import {
  calculateGeometryDistanceM,
  isAfternoonDeparture,
  isNightDeparture,
  normalizePreference,
  resolveTargetDistanceKm,
  weightedAverage,
} from "./geoUtils";
import { scoreRoute } from "./routeScoring";

export type RouteStrategy = "recommended" | "lowest_elevation" | "exploration" | "park" | "direct";

export interface GeneratedRouteCandidate extends RouteCandidate {
  edgeIds: string[];
  edges: RouteEdge[];
  strategy: RouteStrategy;
}

export interface RouteDraft {
  id: string;
  name: string;
  activity: ActivityType;
  routeType: RouteType;
  path: PathResult;
  waypoints?: LatLng[];
  strategy: RouteStrategy;
  referenceEdgeIds?: Set<string>;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function edgeAverage(edges: RouteEdge[], selector: (edge: RouteEdge) => number) {
  return weightedAverage(
    edges.map((edge) => ({
      value: selector(edge),
      weight: Math.max(edge.distanceM, 1),
    })),
    0.5,
  );
}

function scoreDistance(distanceKm: number, targetDistanceKm: number) {
  const missRatio = Math.abs(distanceKm - targetDistanceKm) / Math.max(targetDistanceKm, 0.1);
  return clampScore(100 - missRatio * 160);
}

function wantsClimbing(preferences: UserPreferences) {
  return preferences.routeStyle === "climbing";
}

function scoreElevation(
  activity: ActivityType,
  distanceKm: number,
  elevationGainM: number,
  maxSlopePct: number,
  preferences: UserPreferences,
) {
  const gainPerKm = elevationGainM / Math.max(distanceKm, 0.1);
  const elevationPreference = normalizePreference(preferences.elevationPreference);

  if (wantsClimbing(preferences)) {
    const targetGainPerKm =
      activity === "cycling" ? 14 + elevationPreference * 12 : 22 + elevationPreference * 34;
    const slopePenalty = Math.max(0, maxSlopePct - (activity === "cycling" ? 8 : 14)) * 4;
    return clampScore(100 - Math.abs(gainPerKm - targetGainPerKm) * 1.25 - slopePenalty);
  }

  const slopePenalty = Math.max(0, maxSlopePct - (activity === "cycling" ? 7 : 11)) * 3.5;
  const gainPenalty = gainPerKm * (activity === "cycling" ? 1.2 : 1.05);

  return clampScore(100 - gainPenalty * (0.65 + elevationPreference * 0.75) - slopePenalty);
}

function getReferenceOverlap(edges: RouteEdge[], referenceEdgeIds?: Set<string>) {
  if (!referenceEdgeIds || referenceEdgeIds.size === 0) {
    return 0;
  }

  const sharedDistance = edges.reduce((total, edge) => {
    return referenceEdgeIds.has(getEdgeKey(edge)) ? total + edge.distanceM : total;
  }, 0);
  const totalDistance = edges.reduce((total, edge) => total + edge.distanceM, 0);

  return totalDistance > 0 ? sharedDistance / totalDistance : 0;
}

function getDifficulty(
  activity: ActivityType,
  distanceKm: number,
  elevationGainM: number,
  maxSlopePct: number,
): Difficulty {
  const gainPerKm = elevationGainM / Math.max(distanceKm, 0.1);
  const effort = distanceKm * (activity === "cycling" ? 0.35 : 1) + gainPerKm * 0.18 + maxSlopePct * 0.18;

  if (effort > (activity === "hiking" ? 18 : 13)) {
    return "Hard";
  }

  if (effort > (activity === "cycling" ? 8 : 7)) {
    return "Moderate";
  }

  return "Easy";
}

function buildExplanation(
  route: RouteCandidate,
  preferences: UserPreferences,
  metrics: RouteMetrics,
) {
  const targetDistanceKm = resolveTargetDistanceKm(preferences);
  const reasons = [
    metrics.distanceScore >= 86 ? `closely matches your ${round(targetDistanceKm, 1)} km target` : null,
    metrics.parkScore >= 70 ? "uses park paths and green corridors" : null,
    metrics.elevationScore >= 78 && preferences.routeStyle !== "climbing" ? "keeps elevation controlled" : null,
    metrics.elevationScore >= 78 && preferences.routeStyle === "climbing" ? "adds a measured climbing profile" : null,
    metrics.shadeScore >= 70 ? "prioritizes shade" : null,
    metrics.safetyScore >= 76 ? "avoids higher-stress road segments" : null,
    metrics.explorationScore >= 72 ? "adds legal alternative paths for novelty" : null,
    metrics.sceneryScore >= 74 ? "includes scenic segments" : null,
  ].filter(Boolean);

  const departureNote =
    isAfternoonDeparture(preferences.departureTime) && metrics.shadeScore >= 65
      ? " during your selected afternoon departure time"
      : "";

  if (reasons.length === 0) {
    return `This ${preferences.activity} route balances distance, safety, surface quality, and outdoor appeal.`;
  }

  return `This route was selected because it ${reasons.slice(0, 4).join(", ")}${departureNote}.`;
}

export function analyzeRoute(route: RouteDraft, preferences: UserPreferences): RouteMetrics {
  const edges = route.path.edges;
  const targetDistanceKm = resolveTargetDistanceKm(preferences);
  const distanceKm = round(route.path.distanceM / 1000, 1);
  const elevationGainM = Math.round(edges.reduce((total, edge) => total + Math.max(edge.elevationGainM ?? 0, 0), 0));
  const maxSlopePct = Math.max(0, ...edges.map((edge) => Math.abs(edge.slope ?? 0) * 100));
  const referenceOverlap = getReferenceOverlap(edges, route.referenceEdgeIds);
  const shadePenalty = isAfternoonDeparture(preferences.departureTime) ? 8 : 0;
  const nightSafetyPenalty = isNightDeparture(preferences.departureTime) ? 8 : 0;

  const baseMetrics = {
    distanceScore: scoreDistance(distanceKm, targetDistanceKm),
    elevationScore: scoreElevation(preferences.activity, distanceKm, elevationGainM, maxSlopePct, preferences),
    parkScore: clampScore(edgeAverage(edges, (edge) => edge.parkScore) * 100),
    shadeScore: clampScore(
      edgeAverage(edges, (edge) => edge.shadeScore) * 100 -
        shadePenalty * (1 - edgeAverage(edges, (edge) => edge.shadeScore)),
    ),
    safetyScore: clampScore(
      edgeAverage(edges, (edge) => edge.safetyScore) * 100 -
        nightSafetyPenalty -
        edgeAverage(edges, (edge) => edge.trafficExposure ?? 0.2) * 9,
    ),
    explorationScore: clampScore(
      edgeAverage(edges, (edge) => edge.noveltyScore ?? edge.sceneryScore) * 70 +
        (1 - referenceOverlap) * 30,
    ),
    sceneryScore: clampScore(edgeAverage(edges, (edge) => edge.sceneryScore) * 100),
  };

  return {
    ...baseMetrics,
    totalScore: scoreRoute(
      {
        activity: preferences.activity,
        metrics: {
          ...baseMetrics,
          totalScore: 0,
        },
      },
      preferences,
    ),
  };
}

export function buildRouteCandidate(route: RouteDraft, preferences: UserPreferences): GeneratedRouteCandidate {
  const metrics = analyzeRoute(route, preferences);
  const distanceKm = round(route.path.distanceM / 1000, 1);
  const elevationGainM = Math.round(
    route.path.edges.reduce((total, edge) => total + Math.max(edge.elevationGainM ?? 0, 0), 0),
  );
  const totalDescentM = Math.round(
    route.path.edges.reduce((total, edge) => total + Math.max(-(edge.elevationGainM ?? 0), 0), 0),
  );
  const maxSlopePct = Math.round(Math.max(0, ...route.path.edges.map((edge) => Math.abs(edge.slope ?? 0) * 100)) * 10) / 10;
  const geometryDistanceM = calculateGeometryDistanceM(route.path.geometry);
  const averageSlopePct =
    geometryDistanceM > 0 ? Math.round((elevationGainM / geometryDistanceM) * 1000) / 10 : undefined;
  const candidate: RouteCandidate = {
    id: route.id,
    source: "generated",
    name: route.name,
    activity: route.activity,
    routeType: route.routeType,
    geometry: route.path.geometry,
    waypoints: route.waypoints,
    distanceKm,
    estimatedDurationMin: estimateDurationMin(route.activity, distanceKm),
    elevationGainM,
    totalDescentM,
    averageSlopePct,
    maxSlopePct,
    difficulty: getDifficulty(route.activity, distanceKm, elevationGainM, maxSlopePct),
    metrics,
    explanation: "",
  };

  return {
    ...candidate,
    explanation: buildExplanation(candidate, preferences, metrics),
    edgeIds: route.path.edges.map((edge) => getEdgeKey(edge)),
    edges: route.path.edges,
    strategy: route.strategy,
  };
}

export function routeEdgeIdSet(route: GeneratedRouteCandidate) {
  return new Set(route.edges.map((edge) => getEdgeKey(edge)));
}
