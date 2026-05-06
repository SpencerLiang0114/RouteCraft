import type { RouteCandidate, SavedRoute } from "@/types/route";

export const routecraftStorageKey = "routecraft-flow";

export function toSavedRoute(route: RouteCandidate): SavedRoute {
  // TODO: Promote local saved routes into user route history for personalized recommendations.
  return {
    ...route,
    savedAt: new Date().toISOString(),
  };
}
