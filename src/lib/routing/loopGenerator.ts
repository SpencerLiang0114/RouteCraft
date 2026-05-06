import type { UserPreferences } from "@/types/route";
import type { RouteGraph } from "./graph";
import { combinePaths, findShortestPath } from "./graph";
import { generateLoopWaypointSets, getStartNode } from "./candidateGenerator";
import { buildRouteCandidate } from "./routeAnalyzer";

export function generateLoopRoutes(preferences: UserPreferences, graph: RouteGraph) {
  const startNode = getStartNode(graph, preferences);
  const waypointSets = generateLoopWaypointSets(preferences, graph, startNode);

  return waypointSets.flatMap((set, index) => {
    const nodeIds = [startNode.id, ...set.nodeIds, startNode.id];
    const segments = [];

    for (let step = 0; step < nodeIds.length - 1; step += 1) {
      const segment = findShortestPath(graph, nodeIds[step], nodeIds[step + 1], preferences);

      if (!segment) {
        return [];
      }

      segments.push(segment);
    }

    const path = combinePaths(graph, segments);

    return [
      buildRouteCandidate(
        {
          id: `generated-loop-${index + 1}`,
          name: set.strategy === "park" ? "Park-Weighted Loop" : "Balanced Loop",
          activity: preferences.activity,
          routeType: "loop",
          path,
          waypoints: set.nodeIds.map((nodeId) => graph.nodes[nodeId].point),
          strategy: set.strategy,
        },
        preferences,
      ),
    ];
  });
}
