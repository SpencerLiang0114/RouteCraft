import type { LatLng, UserPreferences } from "@/types/route";
import type { PathResult, RouteGraph } from "./graph";
import {
  combinePaths,
  despikePath,
  findShortestPath,
  getEdgeKey,
  pathSelfOverlapRatio,
} from "./graph";
import { generateLoopWaypointSets, getStartNode } from "./candidateGenerator";
import { buildRouteCandidate, type GeneratedRouteCandidate } from "./routeAnalyzer";
import { angularDifference, bearingDegrees, distanceM } from "./geoUtils";

// Heavy penalties on revisiting edges: a loop should ideally use entirely
// different roads on the way back. >3x cost makes A* avoid retracing unless
// the road geometry leaves no alternative.
const PREVIOUS_EDGE_PENALTY = 2.25;
const CLOSING_SEGMENT_EXTRA_PENALTY = 1.75;
// Overlap thresholds: 12% strict (≈1.2 km on a 10 km loop) is the upper bound
// of what reads as "a true loop" rather than a near-out-and-back.
const STRICT_OVERLAP_LIMIT = 0.12;
const LOOSE_OVERLAP_LIMIT = 0.24;
const MIN_LOOP_COMPACTNESS = 0.025;
const MAX_BACKTRACK_RATIO = 0.18;
const MAX_LEG_DETOUR_RATIO = 2.8;
const MAX_STEEP_SPIKE_RATIO = 0.16;

interface LoopShape {
  overlapRatio: number;
  compactness: number;
  bearingCoverage: number;
  backtrackRatio: number;
  deadEndCount: number;
  maxLegDetourRatio: number;
  steepSpikeRatio: number;
  score: number;
}

function localMeters(point: LatLng, origin: LatLng) {
  const latM = (point.lat - origin.lat) * 110540;
  const lngM = (point.lng - origin.lng) * 111320 * Math.cos((origin.lat * Math.PI) / 180);

  return { x: lngM, y: latM };
}

function loopCompactness(path: PathResult) {
  if (path.geometry.length < 3 || path.distanceM <= 0) {
    return 0;
  }

  const origin = path.geometry[0];
  const points = path.geometry.map((point) => localMeters(point, origin));
  let doubleArea = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    doubleArea += current.x * next.y - next.x * current.y;
  }

  const areaM2 = Math.abs(doubleArea) / 2;

  return (4 * Math.PI * areaM2) / (path.distanceM * path.distanceM);
}

function bearingCoverage(path: PathResult, startPoint: LatLng) {
  const sectors = new Set<number>();

  for (const point of path.geometry) {
    if (distanceM(startPoint, point) < 120) {
      continue;
    }

    sectors.add(Math.floor(bearingDegrees(startPoint, point) / 45));
  }

  return sectors.size / 8;
}

function backtrackRatio(path: PathResult) {
  if (path.edges.length < 2) {
    return 0;
  }

  let backtracks = 0;

  for (let index = 1; index < path.edges.length; index += 1) {
    const previousGeometry = path.edges[index - 1].geometry;
    const currentGeometry = path.edges[index].geometry;
    const previousBearing = bearingDegrees(previousGeometry[0], previousGeometry[previousGeometry.length - 1]);
    const currentBearing = bearingDegrees(currentGeometry[0], currentGeometry[currentGeometry.length - 1]);

    if (angularDifference(previousBearing, currentBearing) >= 155) {
      backtracks += 1;
    }
  }

  return backtracks / (path.edges.length - 1);
}

function internalDeadEndCount(graph: RouteGraph, path: PathResult) {
  const internalNodeIds = path.nodeIds.slice(1, -1);

  return internalNodeIds.filter((nodeId) => {
    const routableDegree = (graph.adjacency[nodeId] ?? []).filter((edge) => edge.accessAllowed).length;
    return routableDegree < 2;
  }).length;
}

function steepSpikeRatio(path: PathResult, preferences: UserPreferences) {
  if (path.distanceM <= 0 || preferences.routeStyle === "climbing") {
    return 0;
  }

  const slopeLimit = preferences.activity === "cycling" ? 0.1 : 0.14;
  const spikeDistanceM = path.edges.reduce((total, edge) => {
    const slope = Math.abs(edge.slope ?? 0);
    return slope > slopeLimit && edge.distanceM <= 700 ? total + edge.distanceM : total;
  }, 0);

  return spikeDistanceM / path.distanceM;
}

function loopShapeScore(shape: Omit<LoopShape, "score">) {
  const compactnessPenalty =
    Math.max(0, MIN_LOOP_COMPACTNESS - shape.compactness) / MIN_LOOP_COMPACTNESS;
  const legDetourPenalty = Math.max(0, shape.maxLegDetourRatio - 2.1);

  return Math.round(
    100 -
      shape.overlapRatio * 150 -
      shape.backtrackRatio * 120 -
      shape.deadEndCount * 35 -
      compactnessPenalty * 45 -
      legDetourPenalty * 18 -
      shape.steepSpikeRatio * 90 +
      shape.bearingCoverage * 10,
  );
}

function evaluateLoopShape(
  graph: RouteGraph,
  path: PathResult,
  startPoint: LatLng,
  legDetourRatios: number[],
  preferences: UserPreferences,
): LoopShape {
  const shape = {
    overlapRatio: pathSelfOverlapRatio(path),
    compactness: loopCompactness(path),
    bearingCoverage: bearingCoverage(path, startPoint),
    backtrackRatio: backtrackRatio(path),
    deadEndCount: internalDeadEndCount(graph, path),
    maxLegDetourRatio: Math.max(1, ...legDetourRatios),
    steepSpikeRatio: steepSpikeRatio(path, preferences),
  };

  return {
    ...shape,
    score: loopShapeScore(shape),
  };
}

function isRealLoopShape(shape: LoopShape) {
  return (
    shape.overlapRatio <= LOOSE_OVERLAP_LIMIT &&
    shape.deadEndCount === 0 &&
    shape.compactness >= MIN_LOOP_COMPACTNESS &&
    shape.backtrackRatio <= MAX_BACKTRACK_RATIO &&
    shape.maxLegDetourRatio <= MAX_LEG_DETOUR_RATIO &&
    shape.steepSpikeRatio <= MAX_STEEP_SPIKE_RATIO
  );
}

function withShapeAdjustedScore(candidate: GeneratedRouteCandidate, shape: LoopShape) {
  return {
    ...candidate,
    metrics: {
      ...candidate.metrics,
      totalScore: Math.max(0, Math.min(100, Math.round(candidate.metrics.totalScore * 0.78 + shape.score * 0.22))),
    },
  };
}

export function generateLoopRoutes(preferences: UserPreferences, graph: RouteGraph) {
  const startNode = getStartNode(graph, preferences);
  const waypointSets = generateLoopWaypointSets(preferences, graph, startNode);

  const built: Array<{ candidate: GeneratedRouteCandidate; shape: LoopShape }> = [];

  for (const [index, set] of waypointSets.entries()) {
    const nodeIds = [startNode.id, ...set.nodeIds, startNode.id];
    const segments: PathResult[] = [];
    const legDetourRatios: number[] = [];
    const edgePenalties = new Map<string, number>();
    let failed = false;

    for (let step = 0; step < nodeIds.length - 1; step += 1) {
      const isClosingSegment = step === nodeIds.length - 2;
      const segmentPenalties = isClosingSegment
        ? new Map(
            [...edgePenalties].map(([key, value]) => [key, value + CLOSING_SEGMENT_EXTRA_PENALTY]),
          )
        : edgePenalties;

      const segment = findShortestPath(graph, nodeIds[step], nodeIds[step + 1], preferences, {
        edgePenalties: segmentPenalties,
      });

      if (!segment) {
        failed = true;
        break;
      }

      segments.push(segment);
      const directDistanceM = distanceM(graph.nodes[nodeIds[step]].point, graph.nodes[nodeIds[step + 1]].point);
      legDetourRatios.push(directDistanceM > 40 ? segment.distanceM / directDistanceM : 1);

      for (const edge of segment.edges) {
        const key = getEdgeKey(edge);
        edgePenalties.set(key, (edgePenalties.get(key) ?? 0) + PREVIOUS_EDGE_PENALTY);
      }
    }

    if (failed) continue;

    const combined = combinePaths(graph, segments);
    const path = despikePath(graph, combined);

    if (path.edges.length === 0) continue;

    const shape = evaluateLoopShape(graph, path, startNode.point, legDetourRatios, preferences);

    const candidate = buildRouteCandidate(
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
    );

    built.push({ candidate: withShapeAdjustedScore(candidate, shape), shape });
  }

  const realLoops = built.filter((entry) => isRealLoopShape(entry.shape));
  const strict = realLoops.filter((entry) => entry.shape.overlapRatio <= STRICT_OVERLAP_LIMIT);
  if (strict.length >= 3) {
    return strict.map((entry) => entry.candidate);
  }

  const loose = realLoops.filter((entry) => entry.shape.overlapRatio <= LOOSE_OVERLAP_LIMIT);
  if (loose.length >= 3) {
    return loose.map((entry) => entry.candidate);
  }

  return realLoops.map((entry) => entry.candidate);
}
