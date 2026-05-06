import type { ExternalRouteMock, RouteCandidate } from "@/types/route";
import { analyzeRoute } from "./routeAnalyzer";

export function normalizeExternalRoute(route: ExternalRouteMock): RouteCandidate {
  // TODO: Replace this adapter with real Strava OAuth/API and AllTrails import adapters.
  return analyzeRoute({
    ...route,
    targetDistanceKm: route.distanceKm,
    explanation:
      route.source === "strava"
        ? "Imported Strava route normalized for RouteCraft scoring and export."
        : "AllTrails route analyzed for shade, parks, elevation, and safety tradeoffs.",
  });
}
