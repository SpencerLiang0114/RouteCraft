import type {
  ActivityType,
  Difficulty,
  ElevationPoint,
  RouteAnalysisSignals,
  RouteCandidate,
  RouteMetrics,
  RouteSource,
  RouteType,
  LatLng,
} from "@/types/route";
import { calculateRouteDistanceKm, clamp, estimateDurationMin } from "./geoUtils";
import { calculateTotalScore } from "./routeScoring";

interface AnalyzeRouteInput {
  id: string;
  source: RouteSource;
  name: string;
  activity: ActivityType;
  geometry: LatLng[];
  routeType?: RouteType;
  waypoints?: LatLng[];
  distanceKm?: number;
  targetDistanceKm?: number;
  estimatedDurationMin?: number;
  elevationGainM?: number;
  totalDescentM?: number;
  averageSlopePct?: number;
  maxSlopePct?: number;
  departureTime?: string;
  elevationProfile?: ElevationPoint[];
  signals?: Partial<RouteAnalysisSignals>;
  explanation?: string;
}

const defaultSignals: RouteAnalysisSignals = {
  parkAccess: 55,
  shadeCover: 45,
  roadExposure: 35,
  safety: 72,
  novelty: 45,
  scenery: 58,
  surfaceQuality: 72,
  intersectionComplexity: 32,
};

function scoreDistance(distanceKm: number, targetDistanceKm?: number) {
  if (!targetDistanceKm) {
    return 88;
  }

  const missRatio = Math.abs(distanceKm - targetDistanceKm) / targetDistanceKm;
  return clamp(100 - missRatio * 150);
}

function scoreElevation(activity: ActivityType, distanceKm: number, elevationGainM: number) {
  const gainPerKm = elevationGainM / Math.max(distanceKm, 0.1);

  if (activity === "hiking") {
    return clamp(92 - Math.abs(gainPerKm - 35) * 0.9);
  }

  if (activity === "cycling") {
    return clamp(96 - gainPerKm * 0.85);
  }

  return clamp(100 - gainPerKm * 1.15);
}

function getSunExposurePenalty(departureTime?: string) {
  const time = departureTime?.toLowerCase() ?? "";
  if (time.includes("afternoon") || time.includes("2:") || time.includes("3:")) {
    return 12;
  }
  if (time.includes("evening")) {
    return 4;
  }
  return 0;
}

function getDifficulty(
  activity: ActivityType,
  distanceKm: number,
  elevationGainM: number,
): Difficulty {
  const gainPerKm = elevationGainM / Math.max(distanceKm, 0.1);
  const effort = distanceKm * (activity === "cycling" ? 0.35 : 1) + gainPerKm * 0.18;

  if (effort > (activity === "hiking" ? 18 : 13)) {
    return "Hard";
  }

  if (effort > (activity === "cycling" ? 8 : 7)) {
    return "Moderate";
  }

  return "Easy";
}

function buildExplanation(
  input: AnalyzeRouteInput,
  metrics: RouteMetrics,
  difficulty: Difficulty,
) {
  if (input.explanation) {
    return input.explanation;
  }

  const strengths = [
    metrics.parkScore >= 65 ? "park access" : null,
    metrics.shadeScore >= 60 ? "shade" : null,
    metrics.safetyScore >= 75 ? "lower-stress streets" : null,
    metrics.explorationScore >= 65 ? "new corridors" : null,
    metrics.sceneryScore >= 70 ? "scenic segments" : null,
  ].filter(Boolean);

  const bestFor =
    strengths.length > 0 ? strengths.slice(0, 2).join(" and ") : "a balanced outing";

  return `${difficulty} ${input.activity} route tuned for ${bestFor}.`;
}

export function analyzeRoute(input: AnalyzeRouteInput): RouteCandidate {
  // TODO: Replace mock elevation fields with a real elevation API and richer slope profile.
  // TODO: Replace simplified shade scoring with solar-position and shadow modeling.
  // TODO: Fold in OpenStreetMap safety data for major roads, crossings, isolation, and access restrictions.
  const distanceKm = input.distanceKm ?? calculateRouteDistanceKm(input.geometry);
  const elevationGainM = input.elevationGainM ?? 0;
  const signals = { ...defaultSignals, ...input.signals };
  const exposurePenalty = getSunExposurePenalty(input.departureTime);

  const baseScores = {
    distanceScore: scoreDistance(distanceKm, input.targetDistanceKm),
    elevationScore: scoreElevation(input.activity, distanceKm, elevationGainM),
    parkScore: clamp(signals.parkAccess),
    shadeScore: clamp(
      signals.shadeCover + signals.parkAccess * 0.18 - signals.roadExposure * 0.2 - exposurePenalty,
    ),
    safetyScore: clamp(
      signals.safety + signals.surfaceQuality * 0.14 - signals.intersectionComplexity * 0.22,
    ),
    explorationScore: clamp(signals.novelty),
    sceneryScore: clamp(signals.scenery),
  };

  const metrics = {
    ...baseScores,
    totalScore: calculateTotalScore(input.activity, baseScores),
  };

  const difficulty = getDifficulty(input.activity, distanceKm, elevationGainM);

  return {
    id: input.id,
    source: input.source,
    name: input.name,
    activity: input.activity,
    routeType: input.routeType,
    geometry: input.geometry,
    waypoints: input.waypoints,
    distanceKm,
    estimatedDurationMin:
      input.estimatedDurationMin ?? estimateDurationMin(input.activity, distanceKm),
    elevationGainM,
    totalDescentM: input.totalDescentM,
    averageSlopePct:
      input.averageSlopePct ??
      (distanceKm > 0 ? Math.round((elevationGainM / (distanceKm * 1000)) * 1000) / 10 : undefined),
    maxSlopePct: input.maxSlopePct,
    elevationProfile: input.elevationProfile,
    difficulty,
    metrics,
    explanation: buildExplanation(input, metrics, difficulty),
  };
}
