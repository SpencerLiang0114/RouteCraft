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

interface KdNode {
  node: RouteNode;
  left: KdNode | null;
  right: KdNode | null;
  axis: 0 | 1;
}

export interface RouteGraph {
  nodes: Record<string, RouteNode>;
  edges: RouteEdge[];
  adjacency: Record<string, RouteEdge[]>;
  kdTree: KdNode | null;
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

function buildKdTree(nodes: RouteNode[], depth = 0): KdNode | null {
  if (nodes.length === 0) return null;
  const axis = (depth % 2) as 0 | 1;
  const sorted = [...nodes].sort((a, b) =>
    axis === 0 ? a.point.lat - b.point.lat : a.point.lng - b.point.lng,
  );
  const mid = Math.floor(sorted.length / 2);
  return {
    node: sorted[mid],
    left: buildKdTree(sorted.slice(0, mid), depth + 1),
    right: buildKdTree(sorted.slice(mid + 1), depth + 1),
    axis,
  };
}

function kdNearest(
  tree: KdNode | null,
  point: LatLng,
  best: { node: RouteNode; dist: number } | null,
): { node: RouteNode; dist: number } | null {
  if (!tree) return best;
  const d = distanceM(point, tree.node.point);
  if (!best || d < best.dist) best = { node: tree.node, dist: d };
  const diff = tree.axis === 0 ? point.lat - tree.node.point.lat : point.lng - tree.node.point.lng;
  const [near, far] = diff < 0 ? [tree.left, tree.right] : [tree.right, tree.left];
  best = kdNearest(near, point, best);
  const planePoint: LatLng =
    tree.axis === 0
      ? { lat: tree.node.point.lat, lng: point.lng }
      : { lat: point.lat, lng: tree.node.point.lng };
  if (distanceM(point, planePoint) < best!.dist) best = kdNearest(far, point, best);
  return best;
}

function kdRange(
  tree: KdNode | null,
  point: LatLng,
  radiusM: number,
  toleranceM: number,
  results: Array<{ node: RouteNode; distanceM: number }>,
): void {
  if (!tree) return;
  const d = distanceM(point, tree.node.point);
  if (Math.abs(d - radiusM) <= toleranceM) results.push({ node: tree.node, distanceM: d });
  const diff = tree.axis === 0 ? point.lat - tree.node.point.lat : point.lng - tree.node.point.lng;
  const [near, far] = diff < 0 ? [tree.left, tree.right] : [tree.right, tree.left];
  kdRange(near, point, radiusM, toleranceM, results);
  const planePoint: LatLng =
    tree.axis === 0
      ? { lat: tree.node.point.lat, lng: point.lng }
      : { lat: point.lat, lng: tree.node.point.lng };
  if (distanceM(point, planePoint) <= radiusM + toleranceM) kdRange(far, point, radiusM, toleranceM, results);
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
    kdTree: buildKdTree(nodes),
  };
}

export function findNearestNode(graph: RouteGraph, point: LatLng) {
  if (graph.kdTree) {
    return kdNearest(graph.kdTree, point, null)?.node;
  }
  return Object.values(graph.nodes).reduce((nearest, node) => {
    const nodeDistance = distanceM(point, node.point);
    if (!nearest || nodeDistance < nearest.distanceM) return { node, distanceM: nodeDistance };
    return nearest;
  }, undefined as { node: RouteNode; distanceM: number } | undefined)?.node;
}

export function findNodesWithinRadius(
  graph: RouteGraph,
  point: LatLng,
  radiusM: number,
  toleranceM: number,
) {
  if (graph.kdTree) {
    const results: Array<{ node: RouteNode; distanceM: number }> = [];
    kdRange(graph.kdTree, point, radiusM, toleranceM, results);
    return results.sort((a, b) => a.distanceM - b.distanceM);
  }
  return Object.values(graph.nodes)
    .map((node) => ({ node, distanceM: distanceM(point, node.point) }))
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
  const nodeIds: string[] = [endId];
  let current = endId;

  while (current !== startId) {
    const step = cameFrom.get(current);

    if (!step) {
      return undefined;
    }

    edges.push(step.edge);
    current = step.previousNodeId;
    nodeIds.push(current);
  }

  edges.reverse();
  nodeIds.reverse();

  return pathFromEdges(graph, nodeIds, edges, totalCost);
}

export function pathFromEdges(
  graph: RouteGraph,
  nodeIds: string[],
  edges: RouteEdge[],
  cost: number,
): PathResult {
  const geometry: LatLng[] = [];
  for (let i = 0; i < edges.length; i++) {
    const pts = edges[i].geometry;
    const start = i === 0 ? 0 : 1;
    for (let j = start; j < pts.length; j++) geometry.push(pts[j]);
  }

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
  const settled = new Set<string>();

  while (openQueue.size > 0) {
    const current = openQueue.pop();

    if (!current) {
      break;
    }

    if (settled.has(current.nodeId)) {
      continue;
    }

    settled.add(current.nodeId);

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

export function despikePath(graph: RouteGraph, path: PathResult): PathResult {
  if (path.edges.length === 0) return path;

  const stack: RouteEdge[] = [];
  for (const edge of path.edges) {
    const top = stack[stack.length - 1];
    if (top && top.from === edge.to && top.to === edge.from) {
      stack.pop();
    } else {
      stack.push(edge);
    }
  }

  if (stack.length === path.edges.length) return path;

  const startNodeId = path.nodeIds[0];

  if (stack.length === 0) {
    return pathFromEdges(graph, [startNodeId], [], 0);
  }

  const newNodeIds = [stack[0].from, ...stack.map((edge) => edge.to)];
  const newDistanceM = stack.reduce((total, edge) => total + edge.distanceM, 0);
  const newCost = path.distanceM > 0 ? path.cost * (newDistanceM / path.distanceM) : 0;

  return pathFromEdges(graph, newNodeIds, stack, newCost);
}

// Single-source shortest path distances by raw road distance (not preference-weighted cost).
// Used to pick destinations whose actual A* path length matches a target.
export function singleSourceShortestDistances(
  graph: RouteGraph,
  startId: string,
): Map<string, number> {
  const queue = new MinHeap();
  queue.push({ nodeId: startId, priority: 0 });
  const distances = new Map<string, number>([[startId, 0]]);
  const settled = new Set<string>();

  while (queue.size > 0) {
    const current = queue.pop();
    if (!current || settled.has(current.nodeId)) continue;
    settled.add(current.nodeId);

    for (const edge of graph.adjacency[current.nodeId] ?? []) {
      if (!edge.accessAllowed) continue;
      const nextDist = (distances.get(current.nodeId) ?? 0) + edge.distanceM;
      const known = distances.get(edge.to);
      if (known === undefined || nextDist < known) {
        distances.set(edge.to, nextDist);
        queue.push({ nodeId: edge.to, priority: nextDist });
      }
    }
  }

  return distances;
}

export function pathSelfOverlapRatio(path: PathResult): number {
  if (path.edges.length === 0 || path.distanceM <= 0) {
    return 0;
  }

  const useCount = new Map<string, number>();
  for (const edge of path.edges) {
    const key = getEdgeKey(edge);
    useCount.set(key, (useCount.get(key) ?? 0) + 1);
  }

  let overlapDistanceM = 0;
  for (const edge of path.edges) {
    if ((useCount.get(getEdgeKey(edge)) ?? 0) > 1) {
      overlapDistanceM += edge.distanceM;
    }
  }

  return overlapDistanceM / path.distanceM;
}

export function combinePaths(graph: RouteGraph, paths: PathResult[]) {
  const edges = paths.flatMap((path) => path.edges);
  const nodeIds: string[] = [];

  for (let i = 0; i < paths.length; i++) {
    const ids = paths[i].nodeIds;
    const start = i === 0 ? 0 : 1;
    for (let j = start; j < ids.length; j++) nodeIds.push(ids[j]);
  }

  return pathFromEdges(graph, nodeIds, edges, paths.reduce((total, path) => total + path.cost, 0));
}
