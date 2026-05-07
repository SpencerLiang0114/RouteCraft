import type { UserPreferences } from "@/types/route";
import type { RouteGraph } from "./graph";
import { combinePaths, findKShortestPaths, findNearestNode, findShortestPath, getEdgeKey } from "./graph";
import { destinationPoint, distanceM, resolveTargetDistanceKm } from "./geoUtils";
import { buildRouteCandidate } from "./routeAnalyzer";

export function generatePointToPointRoutes(preferences: UserPreferences, graph: RouteGraph) {
  const startPoint = preferences.startPoint ?? { lat: 40.0149, lng: -105.2705 };
  const fallbackEndPoint = destinationPoint(startPoint, 65, resolveTargetDistanceKm(preferences) * 700);
  const startNode = findNearestNode(graph, startPoint);
  const endNode = findNearestNode(graph, preferences.endPoint ?? fallbackEndPoint);

  if (!startNode || !endNode || startNode.id === endNode.id) {
    return [];
  }

  const paths = findKShortestPaths(graph, startNode.id, endNode.id, preferences, 9);
  const shortestReference = paths[0]?.edges
    ? new Set(paths[0].edges.map((edge) => getEdgeKey(edge)))
    : undefined;
  const targetDistanceM = resolveTargetDistanceKm(preferences) * 1000;
  const detourPaths =
    paths[0] && targetDistanceM > paths[0].distanceM * 1.2
      ? Object.values(graph.nodes)
          .filter((node) => node.id !== startNode.id && node.id !== endNode.id)
          .map((node) => {
            const straightLineDetourM =
              distanceM(startNode.point, node.point) + distanceM(node.point, endNode.point);

            return {
              node,
              straightLineDetourM,
            };
          })
          .filter((item) => Math.abs(item.straightLineDetourM - targetDistanceM) <= targetDistanceM * 0.45)
          .sort((a, b) => {
            return (
              Math.abs(a.straightLineDetourM - targetDistanceM) -
              Math.abs(b.straightLineDetourM - targetDistanceM)
            );
          })
          .slice(0, 18)
          .flatMap((item) => {
            const firstLeg = findShortestPath(graph, startNode.id, item.node.id, preferences, {
              blockedNodeIds: new Set([endNode.id]),
            });

            if (!firstLeg) {
              return [];
            }

            const secondLegPenalties = new Map(
              firstLeg.edges.map((edge) => [getEdgeKey(edge), 0.6]),
            );
            const secondLeg = findShortestPath(graph, item.node.id, endNode.id, preferences, {
              blockedNodeIds: new Set([startNode.id]),
              edgePenalties: secondLegPenalties,
            });

            if (!secondLeg) {
              return [];
            }

            return [combinePaths(graph, [firstLeg, secondLeg])];
          })
          .sort((a, b) => {
            return Math.abs(a.distanceM - targetDistanceM) - Math.abs(b.distanceM - targetDistanceM);
          })
          .slice(0, 8)
      : [];
  const allPaths = [...paths, ...detourPaths];

  return allPaths.map((path, index) => {
    const isDetour = index >= paths.length;
    const strategy = index === 0 ? "direct" : isDetour || index % 2 === 0 ? "exploration" : "recommended";
    const referenceEdgeIds = index === 0 ? undefined : shortestReference;
    return buildRouteCandidate(
      {
        id: `generated-point-${index + 1}`,
        name: index === 0 ? "Efficient Connector" : isDetour ? "Target-Distance Detour" : "Alternative Connector",
        activity: preferences.activity,
        routeType: "point_to_point",
        path,
        waypoints: [endNode.point],
        strategy,
        referenceEdgeIds,
      },
      preferences,
    );
  });
}
