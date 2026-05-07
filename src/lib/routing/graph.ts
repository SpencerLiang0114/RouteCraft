import type { LatLng, UserPreferences } from "@/types/route";
import { computeEdgeCost } from "./edgeCost";
import { distanceM, undirectedEdgeKey } from "./geoUtils";

export interface RouteNode {
  id: string;
  point: LatLng;
}

export interface RouteEdge {
  id: string;
  from: string;
  to: string;
  distanceM: number;
  geometry: LatLng[];
  surfaceType?: string;
  roadType?: string;
  elevationGainM?: number;
  fromAbsElevM?: number;
  toAbsElevM?: number;
  slope?: number;
  parkScore: number;
  shadeScore: number;
  safetyScore: number;
  sceneryScore: number;
  bikeScore: number;
  walkScore: number;
  accessAllowed: boolean;
  noveltyScore?: number;
  trafficExposure?: number;
  accessRestrictions?: string[];
}

export interface RouteGraph {
  nodes: Record<string, RouteNode>;
  edges: RouteEdge[];
  adjacency: Record<string, RouteEdge[]>;
}

export interface PathResult {
  nodeIds: string[];
  edges: RouteEdge[];
  geometry: LatLng[];
  distanceM: number;
  cost: number;
}

interface PathOptions {
  blockedEdgeIds?: Set<string>;
  blockedNodeIds?: Set<string>;
  edgePenalties?: Map<string, number>;
}

interface QueueItem {
  nodeId: string;
  priority: number;
}

export function createGraph(nodes: RouteNode[], edges: RouteEdge[]): RouteGraph {
  const nodeMap = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const adjacency: Record<string, RouteEdge[]> = {};

  for (const node of nodes) {
    adjacency[node.id] = [];
  }

  for (const edge of edges) {
    if (!adjacency[edge.from]) {
      adjacency[edge.from] = [];
    }

    adjacency[edge.from].push(edge);
  }

  return {
    nodes: nodeMap,
    edges,
    adjacency,
  };
}

export function findNearestNode(graph: RouteGraph, point: LatLng) {
  return Object.values(graph.nodes).reduce((nearest, node) => {
    const nodeDistance = distanceM(point, node.point);

    if (!nearest || nodeDistance < nearest.distanceM) {
      return { node, distanceM: nodeDistance };
    }

    return nearest;
  }, undefined as { node: RouteNode; distanceM: number } | undefined)?.node;
}

export function findNodesWithinRadius(
  graph: RouteGraph,
  point: LatLng,
  radiusM: number,
  toleranceM: number,
) {
  return Object.values(graph.nodes)
    .map((node) => ({
      node,
      distanceM: distanceM(point, node.point),
    }))
    .filter((item) => Math.abs(item.distanceM - radiusM) <= toleranceM)
    .sort((a, b) => a.distanceM - b.distanceM);
}

export function getEdgeKey(edge: Pick<RouteEdge, "from" | "to">) {
  return undirectedEdgeKey(edge.from, edge.to);
}

export function reverseEdge(edge: RouteEdge): RouteEdge {
  return {
    ...edge,
    id: `${edge.id}-reverse`,
    from: edge.to,
    to: edge.from,
    geometry: [...edge.geometry].reverse(),
    fromAbsElevM: edge.toAbsElevM,
    toAbsElevM: edge.fromAbsElevM,
    elevationGainM: edge.elevationGainM !== undefined ? -edge.elevationGainM : undefined,
    slope: edge.slope !== undefined ? -edge.slope : undefined,
  };
}

export function createBidirectionalEdges(edges: RouteEdge[]) {
  return edges.flatMap((edge) => [edge, reverseEdge(edge)]);
}

function reconstructPath(
  graph: RouteGraph,
  startId: string,
  endId: string,
  cameFrom: Map<string, { previousNodeId: string; edge: RouteEdge }>,
  totalCost: number,
): PathResult | undefined {
  const edges: RouteEdge[] = [];
  const nodeIds = [endId];
  let current = endId;

  while (current !== startId) {
    const step = cameFrom.get(current);

    if (!step) {
      return undefined;
    }

    edges.unshift(step.edge);
    current = step.previousNodeId;
    nodeIds.unshift(current);
  }

  return pathFromEdges(graph, nodeIds, edges, totalCost);
}

export function pathFromEdges(
  graph: RouteGraph,
  nodeIds: string[],
  edges: RouteEdge[],
  cost: number,
): PathResult {
  const geometry = edges.reduce<LatLng[]>((points, edge, index) => {
    if (index === 0) {
      return [...edge.geometry];
    }

    return [...points, ...edge.geometry.slice(1)];
  }, []);

  if (geometry.length === 0 && nodeIds.length > 0) {
    geometry.push(graph.nodes[nodeIds[0]].point);
  }

  return {
    nodeIds,
    edges,
    geometry,
    distanceM: edges.reduce((total, edge) => total + edge.distanceM, 0),
    cost,
  };
}

class MinHeap {
  private heap: QueueItem[] = [];

  get size() {
    return this.heap.length;
  }

  push(item: QueueItem) {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): QueueItem | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(i: number) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[parent].priority <= this.heap[i].priority) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }

  private sinkDown(i: number) {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.heap[left].priority < this.heap[smallest].priority) smallest = left;
      if (right < n && this.heap[right].priority < this.heap[smallest].priority) smallest = right;
      if (smallest === i) break;
      [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
      i = smallest;
    }
  }
}

function heuristicCost(graph: RouteGraph, fromId: string, toId: string) {
  const from = graph.nodes[fromId];
  const to = graph.nodes[toId];

  if (!from || !to) {
    return 0;
  }

  return distanceM(from.point, to.point) * 0.2;
}

export function findShortestPath(
  graph: RouteGraph,
  startId: string,
  endId: string,
  preferences: UserPreferences,
  options: PathOptions = {},
): PathResult | undefined {
  if (startId === endId) {
    return pathFromEdges(graph, [startId], [], 0);
  }

  const openQueue = new MinHeap();
  openQueue.push({ nodeId: startId, priority: 0 });
  const cameFrom = new Map<string, { previousNodeId: string; edge: RouteEdge }>();
  const costSoFar = new Map<string, number>([[startId, 0]]);

  while (openQueue.size > 0) {
    const current = openQueue.pop();

    if (!current) {
      break;
    }

    if (current.nodeId === endId) {
      return reconstructPath(graph, startId, endId, cameFrom, costSoFar.get(endId) ?? 0);
    }

    for (const edge of graph.adjacency[current.nodeId] ?? []) {
      if (
        options.blockedEdgeIds?.has(edge.id) ||
        options.blockedEdgeIds?.has(getEdgeKey(edge)) ||
        (edge.to !== endId && options.blockedNodeIds?.has(edge.to))
      ) {
        continue;
      }

      const edgeCost = computeEdgeCost(edge, preferences);

      if (!Number.isFinite(edgeCost)) {
        continue;
      }

      const penalty = options.edgePenalties?.get(edge.id) ?? options.edgePenalties?.get(getEdgeKey(edge)) ?? 0;
      const nextCost = (costSoFar.get(current.nodeId) ?? 0) + edgeCost * (1 + penalty);
      const knownCost = costSoFar.get(edge.to);

      if (knownCost === undefined || nextCost < knownCost) {
        costSoFar.set(edge.to, nextCost);
        cameFrom.set(edge.to, { previousNodeId: current.nodeId, edge });
        openQueue.push({
          nodeId: edge.to,
          priority: nextCost + heuristicCost(graph, edge.to, endId),
        });
      }
    }
  }

  return undefined;
}

function pathSignature(path: PathResult) {
  return path.edges.map((edge) => getEdgeKey(edge)).join("|");
}

export function findKShortestPaths(
  graph: RouteGraph,
  startId: string,
  endId: string,
  preferences: UserPreferences,
  maxPaths = 6,
) {
  const firstPath = findShortestPath(graph, startId, endId, preferences);

  if (!firstPath) {
    return [];
  }

  const accepted: PathResult[] = [firstPath];
  const candidates: PathResult[] = [];
  const candidateSignatures = new Set<string>([pathSignature(firstPath)]);

  for (let k = 1; k < maxPaths; k += 1) {
    const previousPath = accepted[k - 1];

    for (let spurIndex = 0; spurIndex < previousPath.nodeIds.length - 1; spurIndex += 1) {
      const spurNodeId = previousPath.nodeIds[spurIndex];
      const rootEdges = previousPath.edges.slice(0, spurIndex);
      const rootNodeIds = previousPath.nodeIds.slice(0, spurIndex + 1);
      const blockedEdgeIds = new Set<string>();
      const blockedNodeIds = new Set(rootNodeIds.slice(0, -1));

      for (const path of accepted) {
        const hasSameRoot = rootEdges.every((edge, index) => path.edges[index]?.id === edge.id);

        if (hasSameRoot) {
          const edgeToBlock = path.edges[spurIndex];

          if (edgeToBlock) {
            blockedEdgeIds.add(edgeToBlock.id);
            blockedEdgeIds.add(getEdgeKey(edgeToBlock));
          }
        }
      }

      const spurPath = findShortestPath(graph, spurNodeId, endId, preferences, {
        blockedEdgeIds,
        blockedNodeIds,
      });

      if (!spurPath) {
        continue;
      }

      const combinedEdges = [...rootEdges, ...spurPath.edges];
      const combinedNodeIds = [...rootNodeIds, ...spurPath.nodeIds.slice(1)];
      const combinedPath = pathFromEdges(
        graph,
        combinedNodeIds,
        combinedEdges,
        rootEdges.reduce((total, edge) => total + computeEdgeCost(edge, preferences), 0) + spurPath.cost,
      );
      const signature = pathSignature(combinedPath);

      if (!candidateSignatures.has(signature)) {
        candidateSignatures.add(signature);
        candidates.push(combinedPath);
      }
    }

    candidates.sort((a, b) => a.cost - b.cost);
    const nextPath = candidates.shift();

    if (!nextPath) {
      break;
    }

    accepted.push(nextPath);
  }

  return accepted;
}

export function reversePath(path: PathResult): PathResult {
  const edges = [...path.edges].reverse().map(reverseEdge);
  const nodeIds = [...path.nodeIds].reverse();

  return {
    nodeIds,
    edges,
    geometry: [...path.geometry].reverse(),
    distanceM: path.distanceM,
    cost: path.cost,
  };
}

export function combinePaths(graph: RouteGraph, paths: PathResult[]) {
  const edges = paths.flatMap((path) => path.edges);
  const nodeIds = paths.reduce<string[]>((result, path, index) => {
    if (index === 0) {
      return [...path.nodeIds];
    }

    return [...result, ...path.nodeIds.slice(1)];
  }, []);

  return pathFromEdges(graph, nodeIds, edges, paths.reduce((total, path) => total + path.cost, 0));
}
