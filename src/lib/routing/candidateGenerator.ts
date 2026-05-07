import type { LatLng, RouteCandidate, UserPreferences } from "@/types/route";
import type { RouteGraph, RouteNode } from "./graph";
import { findNearestNode } from "./graph";
import type { GeneratedRouteCandidate } from "./routeAnalyzer";
import {
  angularDifference,
  bearingDegrees,
  destinationPoint,
  distanceM,
  distanceToleranceRatio,
  normalizePreference,
  resolveTargetDistanceKm,
} from "./geoUtils";

export interface WaypointSet {
  nodeIds: string[];
  strategy: "recommended" | "lowest_elevation" | "exploration" | "park";
}

function routeQualityNearNode(graph: RouteGraph, nodeId: string, preferences: UserPreferences) {
  const edges = graph.adjacency[nodeId] ?? [];

  if (edges.length === 0) {
    return 0;
  }

  const parkPreference = normalizePreference(preferences.parkPreference);
  const shadePreference = normalizePreference(preferences.shadePreference);
  const safetyPreference = normalizePreference(preferences.safetyPreference);
  const explorationPreference = normalizePreference(preferences.explorationPreference);

  return (
    edges.reduce((total, edge) => {
      if (!edge.accessAllowed) {
        return total - 3;
      }

      return (
        total +
        edge.parkScore * parkPreference +
        edge.shadeScore * shadePreference +
        edge.safetyScore * safetyPreference +
        (edge.noveltyScore ?? edge.sceneryScore) * explorationPreference +
        edge.sceneryScore * 0.4 +
        (preferences.activity === "cycling" ? edge.bikeScore : edge.walkScore)
      );
    }, 0) / edges.length
  );
}

function pickBestNodeNear(
  graph: RouteGraph,
  point: LatLng,
  preferences: UserPreferences,
  excludedNodeIds: Set<string>,
) {
  let best: { node: RouteNode; score: number } | undefined;

  for (const node of Object.values(graph.nodes)) {
    if (excludedNodeIds.has(node.id)) continue;
    const score = routeQualityNearNode(graph, node.id, preferences) * 1000 - distanceM(point, node.point);
    if (!best || score > best.score) best = { node, score };
  }

  return best?.node;
}

export function generateLoopWaypointSets(
  preferences: UserPreferences,
  graph: RouteGraph,
  startNode: RouteNode,
) {
  const targetDistanceM = resolveTargetDistanceKm(preferences) * 1000;
  const baseRadiusM = Math.max(450, targetDistanceM / 4);
  const radii = [baseRadiusM * 0.85, baseRadiusM, baseRadiusM * 1.15, targetDistanceM / 3];
  const bearings = [0, 45, 90, 135, 180, 225, 270, 315];
  const sets: WaypointSet[] = [];

  for (const radiusM of radii) {
    for (const bearing of bearings) {
      const excluded = new Set<string>([startNode.id]);
      const first = pickBestNodeNear(
        graph,
        destinationPoint(startNode.point, bearing, radiusM * 0.92),
        preferences,
        excluded,
      );

      if (!first) {
        continue;
      }

      excluded.add(first.id);

      const second = pickBestNodeNear(
        graph,
        destinationPoint(startNode.point, (bearing + 100) % 360, radiusM * 1.04),
        preferences,
        excluded,
      );

      if (second) {
        sets.push({
          nodeIds: [first.id, second.id],
          strategy: bearing % 90 === 0 ? "recommended" : "exploration",
        });
      }

      const third = pickBestNodeNear(
        graph,
        destinationPoint(startNode.point, (bearing + 185) % 360, radiusM * 0.82),
        preferences,
        new Set([...excluded, second?.id ?? ""]),
      );

      if (second && third) {
        sets.push({
          nodeIds: [first.id, second.id, third.id],
          strategy: "park",
        });
      }
    }
  }

  return sets;
}

export function findOutAndBackDestinations(
  preferences: UserPreferences,
  graph: RouteGraph,
  startNode: RouteNode,
) {
  const targetOutboundM = (resolveTargetDistanceKm(preferences) * 1000) / 2;
  const toleranceM = Math.max(400, targetOutboundM * 0.4);

  const K = 12;
  const topK: Array<{ node: RouteNode; score: number }> = [];

  for (const node of Object.values(graph.nodes)) {
    if (node.id === startNode.id) continue;
    const radialDistance = distanceM(startNode.point, node.point);
    const bearing = bearingDegrees(startNode.point, node.point);
    const distanceScore = 1 - Math.min(1, Math.abs(radialDistance - targetOutboundM) / toleranceM);
    const quality = routeQualityNearNode(graph, node.id, preferences);
    const explorationBias =
      normalizePreference(preferences.explorationPreference) * angularDifference(bearing, 45) * -0.004;
    const score = distanceScore * 3 + quality + explorationBias;

    if (score <= 0.5) continue;

    topK.push({ node, score });

    if (topK.length > K) {
      let minIdx = 0;
      for (let i = 1; i < topK.length; i++) {
        if (topK[i].score < topK[minIdx].score) minIdx = i;
      }
      topK.splice(minIdx, 1);
    }
  }

  return topK.sort((a, b) => b.score - a.score).map((item) => item.node);
}

export function filterByDistance<T extends RouteCandidate>(
  routes: T[],
  targetDistanceKm?: number,
) {
  if (!targetDistanceKm || targetDistanceKm <= 0) {
    return routes;
  }

  const tolerance = distanceToleranceRatio(targetDistanceKm);

  return routes.filter((route) => {
    const missRatio = Math.abs(route.distanceKm - targetDistanceKm) / targetDistanceKm;
    return missRatio <= tolerance;
  });
}

export function rankRoutes<T extends RouteCandidate>(routes: T[]) {
  return [...routes].sort((a, b) => {
    if (b.metrics.totalScore !== a.metrics.totalScore) {
      return b.metrics.totalScore - a.metrics.totalScore;
    }

    return Math.abs(a.elevationGainM - b.elevationGainM);
  });
}

function stripGeneratedLabel(name: string) {
  return name.replace(/^(Recommended Route|Lowest Elevation Route|Exploration Route):\s*/, "");
}

export function applyGeneratedRouteLabels(routes: GeneratedRouteCandidate[]) {
  const result: GeneratedRouteCandidate[] = [];
  const remaining = [...routes];
  const recommended = remaining.shift();

  if (recommended) {
    result.push({
      ...recommended,
      name: `Recommended Route: ${stripGeneratedLabel(recommended.name)}`,
    });
  }

  const lowestIndex = remaining.reduce((bestIndex, route, index) => {
    if (bestIndex === -1 || route.elevationGainM < remaining[bestIndex].elevationGainM) {
      return index;
    }

    return bestIndex;
  }, -1);

  if (lowestIndex >= 0) {
    const [lowest] = remaining.splice(lowestIndex, 1);
    result.push({
      ...lowest,
      name: `Lowest Elevation Route: ${stripGeneratedLabel(lowest.name)}`,
    });
  }

  const explorationIndex = remaining.reduce((bestIndex, route, index) => {
    if (
      bestIndex === -1 ||
      route.metrics.explorationScore > remaining[bestIndex].metrics.explorationScore
    ) {
      return index;
    }

    return bestIndex;
  }, -1);

  if (explorationIndex >= 0) {
    const [exploration] = remaining.splice(explorationIndex, 1);
    result.push({
      ...exploration,
      name: `Exploration Route: ${stripGeneratedLabel(exploration.name)}`,
    });
  }

  return result;
}

export function getStartNode(graph: RouteGraph, preferences: UserPreferences) {
  const startPoint = preferences.startPoint ?? { lat: 40.0149, lng: -105.2705 };
  const startNode = findNearestNode(graph, startPoint);

  if (!startNode) {
    throw new Error("No routable start node found near the selected start point.");
  }

  return startNode;
}
