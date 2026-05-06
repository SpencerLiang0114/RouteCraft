import type { RouteAnalysisSignals, RouteCandidate, UserPreferences } from "@/types/route";
import { analyzeRoute } from "./routeAnalyzer";
import { estimateDurationMin, round } from "./geoUtils";

const fallbackStart = { lat: 40.0149, lng: -105.2705 };

function kmOffset(distanceKm: number) {
  return distanceKm / 111;
}

function buildLoopGeometry(preferences: UserPreferences, variant: number) {
  const start = preferences.startPoint ?? fallbackStart;
  const distanceKm =
    preferences.targetDistanceKm ??
    (preferences.targetDurationMin
      ? preferences.targetDurationMin / (preferences.activity === "cycling" ? 3.1 : 7.2)
      : 8);
  const size = kmOffset(Math.sqrt(distanceKm) * (variant === 2 ? 1.45 : 1.15));
  const wobble = size * (variant === 3 ? 0.45 : 0.25);

  if (preferences.routeType === "point_to_point") {
    return [
      start,
      { lat: start.lat + size * 0.5, lng: start.lng + size + wobble },
      { lat: start.lat + size * 0.9, lng: start.lng + size * 1.8 },
      preferences.endPoint ?? { lat: start.lat + size * 1.2, lng: start.lng + size * 2.25 },
    ];
  }

  return [
    start,
    { lat: start.lat + size, lng: start.lng + wobble },
    { lat: start.lat + size * 0.85, lng: start.lng + size * 1.35 },
    { lat: start.lat - size * 0.15, lng: start.lng + size * 1.1 },
    { lat: start.lat - size * 0.45, lng: start.lng + size * 0.35 },
    start,
  ];
}

function applyPreferenceSignals(
  preferences: UserPreferences,
  template: Partial<RouteAnalysisSignals>,
): RouteAnalysisSignals {
  const style = preferences.routeStyle;

  return {
    parkAccess: Math.min(
      96,
      (template.parkAccess ?? 55) + preferences.parkPreference * 4 + (style === "park_heavy" ? 12 : 0),
    ),
    shadeCover: Math.min(
      95,
      (template.shadeCover ?? 48) + preferences.shadePreference * 4 + (style === "shaded" ? 16 : 0),
    ),
    roadExposure: Math.max(4, template.roadExposure ?? 24),
    safety: Math.min(96, (template.safety ?? 72) + preferences.safetyPreference * 4),
    novelty: Math.min(
      96,
      (template.novelty ?? 46) + preferences.explorationPreference * 4 + (style === "exploration" ? 15 : 0),
    ),
    scenery: Math.min(96, (template.scenery ?? 60) + (style === "scenic" ? 18 : 0)),
    surfaceQuality: template.surfaceQuality ?? 75,
    intersectionComplexity: template.intersectionComplexity ?? 28,
  };
}

export function generateRouteCandidates(preferences: UserPreferences): RouteCandidate[] {
  // TODO: Replace mock geometry with a real routing API that respects legal access and user safety.
  // TODO: Add OpenStreetMap/Overpass park and path analysis before production recommendations.
  // TODO: Add weather-aware suggestions, user route history, and personalized recommendations.
  // TODO: Use the same route model for mobile navigation, live rerouting, and deviation handling.
  const targetDistance =
    preferences.targetDistanceKm ??
    round(
      preferences.targetDurationMin
        ? preferences.targetDurationMin / (preferences.activity === "cycling" ? 3.1 : 7.2)
        : 8,
      1,
    );

  const templates = [
    {
      id: "recommended",
      name: "Park Loop",
      label: "Recommended route",
      distanceDelta: 0.1,
      elevationGainM: preferences.routeStyle === "climbing" ? 150 : 56,
      signals: {
        parkAccess: 66,
        shadeCover: 54,
        roadExposure: 18,
        safety: 82,
        novelty: 58,
        scenery: 72,
        surfaceQuality: 84,
        intersectionComplexity: 22,
      },
      explanation: `Best for relaxed ${preferences.departureTime.toLowerCase()} ${preferences.activity}.`,
    },
    {
      id: "lowest-elevation",
      name: "Creekside Easy Line",
      label: "Lowest-elevation route",
      distanceDelta: -0.2,
      elevationGainM: 28,
      signals: {
        parkAccess: 58,
        shadeCover: 46,
        roadExposure: 24,
        safety: 86,
        novelty: 42,
        scenery: 63,
        surfaceQuality: 88,
        intersectionComplexity: 18,
      },
      explanation: "Flatter option with simpler turns and a steadier effort profile.",
    },
    {
      id: "exploration",
      name: "Hidden Greenway Mix",
      label: "Exploration route",
      distanceDelta: 0.3,
      elevationGainM: preferences.routeStyle === "climbing" ? 220 : 92,
      signals: {
        parkAccess: 72,
        shadeCover: 62,
        roadExposure: 14,
        safety: 76,
        novelty: 82,
        scenery: 78,
        surfaceQuality: 73,
        intersectionComplexity: 30,
      },
      explanation: "Uses alternative public paths for a fresher route without unsafe shortcuts.",
    },
  ];

  return templates.map((template, index) =>
    analyzeRoute({
      id: `generated-${template.id}`,
      source: "generated",
      name: `${template.label}: ${template.name}`,
      activity: preferences.activity,
      routeType: preferences.routeType,
      geometry: buildLoopGeometry(preferences, index + 1),
      distanceKm: round(Math.max(1, targetDistance + template.distanceDelta), 1),
      targetDistanceKm: targetDistance,
      estimatedDurationMin: estimateDurationMin(
        preferences.activity,
        Math.max(1, targetDistance + template.distanceDelta),
      ),
      elevationGainM: template.elevationGainM,
      departureTime: preferences.departureTime,
      signals: applyPreferenceSignals(preferences, template.signals),
      explanation: template.explanation,
    }),
  );
}
