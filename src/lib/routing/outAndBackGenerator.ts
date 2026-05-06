import type { UserPreferences } from "@/types/route";
import type { RouteGraph } from "./graph";
import { combinePaths, findShortestPath, getEdgeKey, reversePath } from "./graph";
import { findOutAndBackDestinations, getStartNode } from "./candidateGenerator";
import { buildRouteCandidate } from "./routeAnalyzer";

export function generateOutAndBackRoutes(preferences: UserPreferences, graph: RouteGraph) {
  const startNode = getStartNode(graph, preferences);
  const destinations = findOutAndBackDestinations(preferences, graph, startNode);

  return destinations.flatMap((destination, index) => {
    const outbound = findShortestPath(graph, startNode.id, destination.id, preferences);

    if (!outbound) {
      return [];
    }

    const edgePenalties = new Map(outbound.edges.map((edge) => [getEdgeKey(edge), 0.55]));
    const alternateReturn = index % 2 === 0
      ? findShortestPath(graph, destination.id, startNode.id, preferences, { edgePenalties })
      : undefined;
    const returnPath = alternateReturn ?? reversePath(outbound);
    const path = combinePaths(graph, [outbound, returnPath]);

    return [
      buildRouteCandidate(
        {
          id: `generated-out-back-${index + 1}`,
          name: alternateReturn ? "Near-Parallel Out and Back" : "Classic Out and Back",
          activity: preferences.activity,
          routeType: "out_and_back",
          path,
          waypoints: [destination.point],
          strategy: alternateReturn ? "exploration" : "recommended",
        },
        preferences,
      ),
    ];
  });
}
