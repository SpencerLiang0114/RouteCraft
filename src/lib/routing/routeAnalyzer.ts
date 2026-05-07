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
  bearingDegrees,
  calculateGeometryDistanceM,
  isAfternoonDeparture,
  isNightDeparture,
  normalizePreference,
  resolveTargetDistanceKm,
  wantsClimbing,
  weightedAverage,
} from "./geoUtils";
import { scoreRoute } from "./routeScoring";

export type RouteStrategy = "recommended" | "lowest_elevation" | "exploration" | "park" | "direct";

// Returns the net elevation change for an edge.
// For OSM routes with working elevation API, edges carry real fromAbsElevM/toAbsElevM
// and elevationGainM is their difference. For mock routes and API-failure fallback,
// we estimate using a bearing-based terrain bias (same model as the mock graph).
function estimatedEdgeElevation(edge: RouteEdge): number {
  if (edge.geometry.length < 2) return 0;
  const from = edge.geometry[0];
  const to = edge.geometry[edge.geometry.length - 1];
  const bearing = bearingDegrees(from, to);
  const uphillBias = Math.cos((bearing * Math.PI) / 180) * 0.018 + Math.sin((bearing * Math.PI) / 180) * 0.01;
  return edge.distanceM * uphillBias;
}

function buildElevationData(edges: RouteEdge[]) {
  // Edges with fromAbsElevM/toAbsElevM carry actual Open-Meteo elevation data.
  // Edges with only elevationGainM (non-zero) carry mock-graph bearing estimates.
  // Edges with all zeros have no elevation data — use bearing estimate as fallback.
  const hasAbsoluteElevation = edges.some((e) => e.fromAbsElevM != null);
  const hasAnyElevationData = hasAbsoluteElevation || edges.some((e) => (e.elevationGainM ?? 0) !== 0);

  function netElevChange(edge: RouteEdge): number {
    if (hasAbsoluteElevation) {
      if (edge.fromAbsElevM != null && edge.toAbsElevM != null) {
        return edge.toAbsElevM - edge.fromAbsElevM;
      }
      return edge.elevationGainM ?? 0;
    }
    if (hasAnyElevationData) return edge.elevationGainM ?? 0;
    return estimatedEdgeElevation(edge);
  }

  const startAbsElev = hasAbsoluteElevation
    ? (edges.find((e) => e.fromAbsElevM != null)?.fromAbsElevM ?? 0)
    : 0;

  // Build raw profile, tagging each point as "real" (from API) or estimated.
  // profile[0] is treated as a known anchor when we have any absolute elevation.
  type RawPoint = { distanceKm: number; elevM: number; real: boolean };
  const rawProfile: RawPoint[] = [
    { distanceKm: 0, elevM: Math.round(startAbsElev), real: hasAbsoluteElevation },
  ];
  let accDistM = 0;
  let accElevM = startAbsElev;

  for (const edge of edges) {
    accDistM += edge.distanceM;
    let real: boolean;
    if (hasAbsoluteElevation && edge.toAbsElevM != null) {
      accElevM = edge.toAbsElevM;
      real = true;
    } else {
      accElevM += netElevChange(edge);
      real = false;
    }
    rawProfile.push({ distanceKm: Math.round(accDistM / 10) / 100, elevM: Math.round(accElevM), real });
  }

  // When we have absolute elevation, interpolate linearly between real anchor points so
  // connector edges (which carry no API elevation) don't produce flat plateaus in the chart.
  let profile: Array<{ distanceKm: number; elevM: number }>;
  if (hasAbsoluteElevation) {
    const filled = rawProfile.map((p) => ({ ...p }));
    const realIdx = filled.map((p, i) => (p.real ? i : -1)).filter((i) => i >= 0);

    // Interpolate between consecutive real points.
    for (let r = 0; r + 1 < realIdx.length; r++) {
      const lo = realIdx[r];
      const hi = realIdx[r + 1];
      const fromElev = filled[lo].elevM;
      const toElev = filled[hi].elevM;
      const span = filled[hi].distanceKm - filled[lo].distanceKm;
      for (let j = lo + 1; j < hi; j++) {
        const t = span > 0 ? (filled[j].distanceKm - filled[lo].distanceKm) / span : 0;
        filled[j].elevM = Math.round(fromElev + t * (toElev - fromElev));
      }
    }

    // Hold the last known elevation for any trailing connector points.
    if (realIdx.length > 0) {
      const lastElev = filled[realIdx[realIdx.length - 1]].elevM;
      for (let j = realIdx[realIdx.length - 1] + 1; j < filled.length; j++) {
        filled[j].elevM = lastElev;
      }
    }

    profile = filled.map(({ distanceKm, elevM }) => ({ distanceKm, elevM }));
  } else {
    profile = rawProfile.map(({ distanceKm, elevM }) => ({ distanceKm, elevM }));
  }

  // Compute stats from the interpolated profile: sum positive/negative point-to-point diffs.
  const elevations = profile.map((p) => p.elevM);
  const lowestElevM = Math.min(...elevations);
  const highestElevM = Math.max(...elevations);
  const elevationGainM = Math.round(
    profile.reduce((total, point, i) => total + (i === 0 ? 0 : Math.max(point.elevM - profile[i - 1].elevM, 0)), 0),
  );
  const totalDescentM = Math.round(
    profile.reduce((total, point, i) => total + (i === 0 ? 0 : Math.max(profile[i - 1].elevM - point.elevM, 0)), 0),
  );

  return {
    profile,
    elevationGainM,
    totalDescentM,
    lowestElevM: Math.round(lowestElevM),
    highestElevM: Math.round(highestElevM),
    elevDifferenceM: Math.round(highestElevM - lowestElevM),
  };
}

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
  const elevData = buildElevationData(route.path.edges);
  const maxSlopePct = Math.round(Math.max(0, ...route.path.edges.map((edge) => Math.abs(edge.slope ?? 0) * 100)) * 10) / 10;
  const geometryDistanceM = calculateGeometryDistanceM(route.path.geometry);
  const averageSlopePct =
    geometryDistanceM > 0 ? Math.round((elevData.elevationGainM / geometryDistanceM) * 1000) / 10 : undefined;
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
    elevationGainM: elevData.elevationGainM,
    totalDescentM: elevData.totalDescentM,
    averageSlopePct,
    maxSlopePct,
    lowestElevM: elevData.lowestElevM,
    highestElevM: elevData.highestElevM,
    elevDifferenceM: elevData.elevDifferenceM,
    elevationProfile: elevData.profile,
    difficulty: getDifficulty(route.activity, distanceKm, elevData.elevationGainM, maxSlopePct),
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
