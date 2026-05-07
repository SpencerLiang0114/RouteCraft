import type { LatLng, RouteCandidate, UserPreferences } from "@/types/route";
import type { RouteGraph, RouteNode } from "./graph";
import { findNearestNode, singleSourceShortestDistances } from "./graph";
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
    // Dead-end nodes (degree 1) cause spike artifacts where the loop enters a
    // side road and immediately backtracks. Restrict waypoints to through-nodes.
    if ((graph.adjacency[node.id]?.length ?? 0) < 2) continue;
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
  // Radius factors account for ~1.3× road-detour on the actual A* path.
  // 2-waypoint (triangle) straight-line perimeter ≈ 3.46R → × 1.3 ≈ 4.5R → R = D/4.5
  // 3-waypoint (quad) straight-line perimeter ≈ 4.51R → × 1.3 ≈ 5.86R → R = D/6
  const twoWpBaseRadiusM = Math.max(450, targetDistanceM / 4.5);
  const threeWpBaseRadiusM = Math.max(300, targetDistanceM / 6);
  const bearings = [0, 45, 90, 135, 180, 225, 270, 315];
  const sets: WaypointSet[] = [];

  for (const radiusM of [twoWpBaseRadiusM * 0.9, twoWpBaseRadiusM, twoWpBaseRadiusM * 1.1]) {
    for (const bearing of bearings) {
      const excluded = new Set<string>([startNode.id]);
      const first = pickBestNodeNear(
        graph,
        destinationPoint(startNode.point, bearing, radiusM * 0.92),
        preferences,
        excluded,
      );

      if (!first) continue;
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
    }
  }

  for (const radiusM of [threeWpBaseRadiusM * 0.9, threeWpBaseRadiusM, threeWpBaseRadiusM * 1.1]) {
    for (const bearing of bearings) {
      const excluded = new Set<string>([startNode.id]);
      const first = pickBestNodeNear(
        graph,
        destinationPoint(startNode.point, bearing, radiusM * 0.92),
        preferences,
        excluded,
      );

      if (!first) continue;
      excluded.add(first.id);

      const second = pickBestNodeNear(
        graph,
        destinationPoint(startNode.point, (bearing + 100) % 360, radiusM * 1.04),
        preferences,
        excluded,
      );

      if (!second) continue;
      excluded.add(second.id);

      const third = pickBestNodeNear(
        graph,
        destinationPoint(startNode.point, (bearing + 185) % 360, radiusM * 0.82),
        preferences,
        excluded,
      );

      if (third) {
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
  // The user's target distance is for the round trip; each outbound leg should be half.
  // Use ACTUAL road distances (single-source Dijkstra) — straight-line approximations
  // are too imprecise to consistently land within ±500m of target.
  const targetOutboundM = (resolveTargetDistanceKm(preferences) * 1000) / 2;
  const roadDistances = singleSourceShortestDistances(graph, startNode.id);

  // Hard cap at ±25% of target/2: total round trip stays within ±25% of target.
  // The downstream filter (±500m) does the final cut; this just bounds the search pool.
  const HARD_CAP_M = Math.max(400, targetOutboundM * 0.25);

  const candidates: Array<{ node: RouteNode; score: number; distanceErrorM: number }> = [];

  for (const [nodeId, roadDistanceM] of roadDistances) {
    if (nodeId === startNode.id) continue;
    const node = graph.nodes[nodeId];
    if (!node) continue;
    // Avoid dead-end destinations — they create the spike artifacts and confuse runners.
    if ((graph.adjacency[nodeId]?.length ?? 0) < 2) continue;

    const distanceErrorM = Math.abs(roadDistanceM - targetOutboundM);
    if (distanceErrorM > HARD_CAP_M) continue;

    const bearing = bearingDegrees(startNode.point, node.point);
    const distanceScore = 1 - distanceErrorM / HARD_CAP_M;
    const quality = routeQualityNearNode(graph, nodeId, preferences);
    const explorationBias =
      normalizePreference(preferences.explorationPreference) * angularDifference(bearing, 45) * -0.004;
    const score = distanceScore * 3 + quality + explorationBias;

    candidates.push({ node, score, distanceErrorM });
  }

  // If too few destinations land within the strict cap, broaden it once so the
  // user always gets results — distance-filtered downstream selection sorts the rest.
  if (candidates.length < 5) {
    const RELAXED_CAP_M = Math.max(800, targetOutboundM * 0.5);
    for (const [nodeId, roadDistanceM] of roadDistances) {
      if (nodeId === startNode.id) continue;
      const node = graph.nodes[nodeId];
      if (!node) continue;
      if ((graph.adjacency[nodeId]?.length ?? 0) < 2) continue;
      const distanceErrorM = Math.abs(roadDistanceM - targetOutboundM);
      if (distanceErrorM <= HARD_CAP_M || distanceErrorM > RELAXED_CAP_M) continue;
      const bearing = bearingDegrees(startNode.point, node.point);
      const distanceScore = 1 - distanceErrorM / RELAXED_CAP_M;
      const quality = routeQualityNearNode(graph, nodeId, preferences);
      const explorationBias =
        normalizePreference(preferences.explorationPreference) * angularDifference(bearing, 45) * -0.004;
      const score = distanceScore * 3 + quality + explorationBias;
      candidates.push({ node, score, distanceErrorM });
    }
  }

  candidates.sort((a, b) => {
    // Sort primarily by distance accuracy, breaking ties (within 150m) by score.
    if (Math.abs(a.distanceErrorM - b.distanceErrorM) < 150) {
      return b.score - a.score;
    }
    return a.distanceErrorM - b.distanceErrorM;
  });

  return candidates.slice(0, 30).map((item) => item.node);
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
