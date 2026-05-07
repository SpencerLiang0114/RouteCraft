import type { ExternalRouteMock, RouteCandidate } from "@/types/route";
import { analyzeRoute } from "./routeAnalyzer";

export function normalizeExternalRoute(route: ExternalRouteMock): RouteCandidate {
  return analyzeRoute({
    ...route,
    targetDistanceKm: route.distanceKm,
  });
}
