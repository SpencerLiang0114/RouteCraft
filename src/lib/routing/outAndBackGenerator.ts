import type { UserPreferences } from "@/types/route";
import type { RouteGraph } from "./graph";
import { combinePaths, findShortestPath, reversePath } from "./graph";
import { findOutAndBackDestinations, getStartNode } from "./candidateGenerator";
import { resolveTargetDistanceKm } from "./geoUtils";
import { buildRouteCandidate } from "./routeAnalyzer";

export function generateOutAndBackRoutes(preferences: UserPreferences, graph: RouteGraph) {
  const startNode = getStartNode(graph, preferences);
  const targetDistanceM = resolveTargetDistanceKm(preferences) * 1000;
  const destinations = findOutAndBackDestinations(preferences, graph, startNode);

  const candidates = destinations
    .map((destination) => {
      const outbound = findShortestPath(graph, startNode.id, destination.id, preferences);
      if (!outbound) return null;
      const reverseError = Math.abs(outbound.distanceM * 2 - targetDistanceM);
      return { outbound, destination, reverseError };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  // Closest to target round-trip first.
  candidates.sort((a, b) => a.reverseError - b.reverseError);

  return candidates.map((candidate, index) => {
    const { outbound, destination } = candidate;
    // Out-and-back semantics: the return retraces the outbound exactly so
    // total distance is deterministic (2 × outbound) and the runner sees the
    // same scenery in reverse.
    const path = combinePaths(graph, [outbound, reversePath(outbound)]);

    return buildRouteCandidate(
      {
        id: `generated-out-back-${index + 1}`,
        name: "Out and Back",
        activity: preferences.activity,
        routeType: "out_and_back",
        path,
        waypoints: [destination.point],
        strategy: "recommended",
      },
      preferences,
    );
  });
}
