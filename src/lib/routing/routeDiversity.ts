import type { RouteCandidate } from "@/types/route";
import type { GeneratedRouteCandidate } from "./routeAnalyzer";
import { calculateGeometryDistanceM, distanceM } from "./geoUtils";

function hasInternalEdges(route: RouteCandidate): route is GeneratedRouteCandidate {
  return "edges" in route && Array.isArray((route as GeneratedRouteCandidate).edges);
}

function routeDistanceByEdge(route: GeneratedRouteCandidate, edgeId: string) {
  return route.edges.reduce((total, edge) => {
    const key = [edge.from, edge.to].sort().join("<>");
    return key === edgeId ? total + edge.distanceM : total;
  }, 0);
}

function geometrySegmentKeys(route: RouteCandidate) {
  return route.geometry.slice(1).map((point, index) => {
    const previous = route.geometry[index];
    const first = `${previous.lat.toFixed(4)},${previous.lng.toFixed(4)}`;
    const second = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;

    return [first, second].sort().join("<>");
  });
}

export function routeOverlap(routeA: RouteCandidate, routeB: RouteCandidate) {
  if (hasInternalEdges(routeA) && hasInternalEdges(routeB)) {
    const edgeIdsA = new Set(routeA.edgeIds);
    const edgeIdsB = new Set(routeB.edgeIds);
    const sharedEdgeIds = [...edgeIdsA].filter((edgeId) => edgeIdsB.has(edgeId));
    const sharedDistance = sharedEdgeIds.reduce((total, edgeId) => {
      return total + Math.min(routeDistanceByEdge(routeA, edgeId), routeDistanceByEdge(routeB, edgeId));
    }, 0);
    const shorterDistance = Math.min(routeA.distanceKm, routeB.distanceKm) * 1000;

    return shorterDistance > 0 ? sharedDistance / shorterDistance : 0;
  }

  const segmentKeysA = new Set(geometrySegmentKeys(routeA));
  const segmentKeysB = new Set(geometrySegmentKeys(routeB));
  const sharedSegments = [...segmentKeysA].filter((segment) => segmentKeysB.has(segment)).length;
  const denominator = Math.min(segmentKeysA.size, segmentKeysB.size);

  if (denominator === 0) {
    const endpointDistance = distanceM(routeA.geometry[0], routeB.geometry[0]);
    return endpointDistance < 20 ? 1 : 0;
  }

  const geometryDistanceRatio =
    Math.min(calculateGeometryDistanceM(routeA.geometry), calculateGeometryDistanceM(routeB.geometry)) /
    Math.max(calculateGeometryDistanceM(routeA.geometry), calculateGeometryDistanceM(routeB.geometry), 1);

  return (sharedSegments / denominator) * geometryDistanceRatio;
}

export function filterDiverseRoutes<T extends RouteCandidate>(routes: T[], maxOverlap = 0.7) {
  const kept: T[] = [];

  for (const route of routes) {
    const overlapsExisting = kept.some((keptRoute) => routeOverlap(route, keptRoute) > maxOverlap);

    if (!overlapsExisting) {
      kept.push(route);
    }
  }

  return kept;
}
