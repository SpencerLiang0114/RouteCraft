import "server-only";

import type { LatLng, RouteCandidate, UserPreferences } from "@/types/route";
import {
  applyGeneratedRouteLabels,
  filterByDistance,
  rankRoutes,
} from "@/lib/routing/candidateGenerator";
import { filterDiverseRoutes } from "@/lib/routing/routeDiversity";
import type { GeneratedRouteCandidate } from "@/lib/routing/routeAnalyzer";
import { generateLoopRoutes } from "@/lib/routing/loopGenerator";
import { generateOutAndBackRoutes } from "@/lib/routing/outAndBackGenerator";
import { generatePointToPointRoutes } from "@/lib/routing/pointToPointGenerator";
import { loadMockGraphNear } from "@/lib/routing/mockGraph";
import { fetchRouteElevationProfile, loadOsmGraphNear } from "@/lib/routing/osmGraph";
import type { RouteGraph } from "@/lib/routing/graph";
import { resolveTargetDistanceKm } from "@/lib/routing/geoUtils";

const fallbackStart: LatLng = { lat: 40.0149, lng: -105.2705 };

function generateRouteCandidatesInternal(preferences: UserPreferences, graph: RouteGraph) {
  if (preferences.routeType === "loop") {
    return generateLoopRoutes(preferences, graph);
  }

  if (preferences.routeType === "out_and_back") {
    return generateOutAndBackRoutes(preferences, graph);
  }

  if (preferences.routeType === "point_to_point") {
    return generatePointToPointRoutes(preferences, graph);
  }

  return [];
}

function byDistanceMiss(preferences: UserPreferences) {
  const targetDistanceKm = resolveTargetDistanceKm(preferences);

  return (a: RouteCandidate, b: RouteCandidate) => {
    return (
      Math.abs(a.distanceKm - targetDistanceKm) -
      Math.abs(b.distanceKm - targetDistanceKm)
    );
  };
}

function stripInternalFields(route: GeneratedRouteCandidate): RouteCandidate {
  return {
    id: route.id,
    source: route.source,
    name: route.name,
    activity: route.activity,
    routeType: route.routeType,
    geometry: route.geometry,
    waypoints: route.waypoints,
    distanceKm: route.distanceKm,
    estimatedDurationMin: route.estimatedDurationMin,
    elevationGainM: route.elevationGainM,
    totalDescentM: route.totalDescentM,
    averageSlopePct: route.averageSlopePct,
    maxSlopePct: route.maxSlopePct,
    lowestElevM: route.lowestElevM,
    highestElevM: route.highestElevM,
    elevDifferenceM: route.elevDifferenceM,
    elevationProfile: route.elevationProfile,
    difficulty: route.difficulty,
    metrics: route.metrics,
    explanation: route.explanation,
  };
}

export function generateRouteCandidates(preferences: UserPreferences): RouteCandidate[] {
  // Synchronous backend fallback when live OSM/elevation APIs are unavailable.
  // TODO: Integrate tree canopy, building shadow, weather, and user history data.
  // TODO: Use live rerouting and mobile navigation hooks once the app has navigation state.
  const graph = loadMockGraphNear(preferences.startPoint ?? fallbackStart, preferences);

  return selectTopRoutes(preferences, generateRouteCandidatesInternal(preferences, graph));
}

function selectTopRoutes(
  preferences: UserPreferences,
  candidates: GeneratedRouteCandidate[],
) {
  const targetDistanceKm = resolveTargetDistanceKm(preferences);
  const distanceFiltered = filterByDistance(candidates, targetDistanceKm);
  const routePool =
    distanceFiltered.length >= 3
      ? distanceFiltered
      : [...distanceFiltered, ...candidates.sort(byDistanceMiss(preferences))]
          .filter((route, index, routes) => routes.findIndex((item) => item.id === route.id) === index)
          .slice(0, Math.max(3, candidates.length));
  const ranked = rankRoutes(routePool);
  const diverse = filterDiverseRoutes(ranked, 0.7);
  const selected = diverse.length >= 3 ? diverse : filterDiverseRoutes(ranked, 0.9);

  return applyGeneratedRouteLabels(selected).slice(0, 3).map(stripInternalFields);
}

async function enrichRoutesWithElevation(routes: RouteCandidate[]): Promise<RouteCandidate[]> {
  return Promise.all(
    routes.map(async (route) => {
      try {
        const elevData = await fetchRouteElevationProfile(route.geometry);
        if (!elevData) return route;
        const averageSlopePct =
          route.distanceKm > 0
            ? Math.round((elevData.elevationGainM / (route.distanceKm * 1000)) * 1000) / 10
            : route.averageSlopePct;
        return {
          ...route,
          elevationProfile: elevData.profile,
          elevationGainM: elevData.elevationGainM,
          totalDescentM: elevData.totalDescentM,
          lowestElevM: elevData.lowestElevM,
          highestElevM: elevData.highestElevM,
          elevDifferenceM: elevData.elevDifferenceM,
          averageSlopePct,
        };
      } catch {
        return route;
      }
    }),
  );
}

export async function generateRoutes(preferences: UserPreferences): Promise<RouteCandidate[]> {
  const startPoint = preferences.startPoint ?? fallbackStart;

  try {
    const graph = await loadOsmGraphNear(startPoint, preferences);
    const routes = selectTopRoutes(preferences, generateRouteCandidatesInternal(preferences, graph));

    if (routes.length >= 3) {
      return enrichRoutesWithElevation(routes);
    }
  } catch (error) {
    console.warn("Falling back to mock routing graph.", error);
  }

  return generateRouteCandidates(preferences);
}
