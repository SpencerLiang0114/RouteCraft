import type { UserPreferences } from "@/types/route";
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

// Heavy penalties on revisiting edges: a loop should ideally use entirely
// different roads on the way back. ×2.5 cost makes A* avoid retracing unless
// the road geometry leaves no alternative.
const PREVIOUS_EDGE_PENALTY = 1.5;
const CLOSING_SEGMENT_EXTRA_PENALTY = 1.0;
// Overlap thresholds: 15% strict (≈1.5 km on a 10 km loop) is the upper bound
// of what reads as "a true loop" rather than a near-out-and-back.
const STRICT_OVERLAP_LIMIT = 0.15;
const LOOSE_OVERLAP_LIMIT = 0.35;

export function generateLoopRoutes(preferences: UserPreferences, graph: RouteGraph) {
  const startNode = getStartNode(graph, preferences);
  const waypointSets = generateLoopWaypointSets(preferences, graph, startNode);

  const built: Array<{ candidate: GeneratedRouteCandidate; overlapRatio: number }> = [];

  for (const [index, set] of waypointSets.entries()) {
    const nodeIds = [startNode.id, ...set.nodeIds, startNode.id];
    const segments: PathResult[] = [];
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

      for (const edge of segment.edges) {
        const key = getEdgeKey(edge);
        edgePenalties.set(key, (edgePenalties.get(key) ?? 0) + PREVIOUS_EDGE_PENALTY);
      }
    }

    if (failed) continue;

    const combined = combinePaths(graph, segments);
    const path = despikePath(graph, combined);

    if (path.edges.length === 0) continue;

    const overlapRatio = pathSelfOverlapRatio(path);

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

    built.push({ candidate, overlapRatio });
  }

  const strict = built.filter((entry) => entry.overlapRatio <= STRICT_OVERLAP_LIMIT);
  if (strict.length >= 3) {
    return strict.map((entry) => entry.candidate);
  }

  const loose = built.filter((entry) => entry.overlapRatio <= LOOSE_OVERLAP_LIMIT);
  if (loose.length >= 3) {
    return loose.map((entry) => entry.candidate);
  }

  return built.map((entry) => entry.candidate);
}
