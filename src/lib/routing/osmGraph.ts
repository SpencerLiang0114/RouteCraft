import type { LatLng, UserPreferences } from "@/types/route";
import type { RouteEdge, RouteNode } from "./graph";
import { createBidirectionalEdges, createGraph, type RouteGraph } from "./graph";
import {
  distanceM,
  resolveTargetDistanceKm,
} from "./geoUtils";

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const ELEVATION_ENDPOINT = "https://api.open-meteo.com/v1/elevation";
const OPEN_ELEVATION_ENDPOINT = "https://api.open-elevation.com/api/v1/lookup";
const MAX_ELEVATION_POINTS = 800;

type OsmTags = Record<string, string | undefined>;

interface OsmElement {
  type: string;
  id: number;
  nodes?: number[];
  geometry?: LatLng[];
  tags?: OsmTags;
}

interface RawOsmElement extends Omit<OsmElement, "geometry"> {
  geometry?: Array<{ lat: number; lng?: number; lon?: number }>;
}

interface GreenFeature {
  geometry: LatLng[];
  tags: OsmTags;
  kind: "park" | "woods" | "water" | "green";
}

interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function bboxAround(point: LatLng, radiusKm: number): BBox {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((point.lat * Math.PI) / 180));

  return {
    south: point.lat - latDelta,
    west: point.lng - lngDelta,
    north: point.lat + latDelta,
    east: point.lng + lngDelta,
  };
}

function bboxString(bbox: BBox) {
  return `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
}

function graphRadiusKm(preferences: UserPreferences) {
  const targetDistanceKm = resolveTargetDistanceKm(preferences);
  const activityMultiplier = preferences.activity === "cycling" ? 0.58 : 0.42;
  const maxRadius = preferences.activity === "cycling" ? 12 : 7;

  return clamp(targetDistanceKm * activityMultiplier + 0.7, 2.2, maxRadius);
}

function buildOverpassQuery(bbox: BBox) {
  const bounds = bboxString(bbox);

  return `
[out:json][timeout:25];
(
  way["highway"~"^(footway|path|cycleway|pedestrian|residential|living_street|track|service|unclassified|tertiary|secondary|primary)$"](${bounds});
  way["leisure"~"^(park|garden|nature_reserve|recreation_ground)$"](${bounds});
  way["landuse"~"^(forest|grass|meadow|recreation_ground|village_green|cemetery)$"](${bounds});
  way["natural"~"^(wood|scrub|grassland|heath|water)$"](${bounds});
);
out body geom;
`;
}

async function fetchOverpassElements(bbox: BBox): Promise<OsmElement[]> {
  const response = await fetch(OVERPASS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "RouteCraft local route generation",
    },
    body: new URLSearchParams({ data: buildOverpassQuery(bbox) }).toString(),
    signal: AbortSignal.timeout(25000),
  });

  if (!response.ok) {
    throw new Error(`Overpass request failed with ${response.status}.`);
  }

  const data = (await response.json()) as { elements?: RawOsmElement[] };
  return (data.elements ?? []).map((element) => ({
    ...element,
    geometry: element.geometry
      ?.map((point) => ({
        lat: point.lat,
        lng: point.lng ?? point.lon,
      }))
      .filter((point): point is LatLng => typeof point.lat === "number" && typeof point.lng === "number"),
  }));
}

function getNodeId(way: OsmElement, index: number, point: LatLng) {
  const osmNodeId = way.nodes?.[index];

  if (osmNodeId) {
    return `osm-node-${osmNodeId}`;
  }

  return `coord-${point.lat.toFixed(6)}-${point.lng.toFixed(6)}`;
}

function accessAllowed(tags: OsmTags, activity: UserPreferences["activity"]) {
  const access = tags.access;
  const foot = tags.foot;
  const bicycle = tags.bicycle;
  const highway = tags.highway;
  const privateAccess = access === "private" || access === "no" || access === "customers" || access === "permit";

  if (privateAccess || tags["access:conditional"]) {
    return false;
  }

  if ((activity === "running" || activity === "hiking") && (foot === "no" || highway === "motorway")) {
    return false;
  }

  if (activity === "cycling" && (bicycle === "no" || highway === "footway" && bicycle !== "yes" && bicycle !== "designated")) {
    return false;
  }

  return true;
}

function roadType(tags: OsmTags) {
  if (tags.highway === "cycleway") {
    return "bike_path";
  }

  if (tags.highway === "path" || tags.highway === "footway" || tags.highway === "pedestrian") {
    return tags.surface === "dirt" || tags.surface === "ground" ? "trail" : "park_path";
  }

  return tags.highway ?? "path";
}

function surfaceType(tags: OsmTags) {
  if (tags.surface) {
    return tags.surface;
  }

  if (tags.highway === "path" || tags.highway === "track") {
    return "dirt";
  }

  return "paved";
}

function trafficExposure(tags: OsmTags) {
  const highway = tags.highway;

  if (highway === "primary") {
    return 0.86;
  }

  if (highway === "secondary") {
    return 0.68;
  }

  if (highway === "tertiary") {
    return 0.48;
  }

  if (highway === "residential" || highway === "living_street") {
    return 0.18;
  }

  if (highway === "cycleway" || highway === "footway" || highway === "path" || highway === "pedestrian") {
    return 0.04;
  }

  return 0.28;
}

function safetyScore(tags: OsmTags) {
  const exposure = trafficExposure(tags);
  const sidewalkBonus = tags.sidewalk && tags.sidewalk !== "no" ? 0.14 : 0;
  const litBonus = tags.lit === "yes" ? 0.06 : 0;
  const pathBonus =
    tags.highway === "cycleway" || tags.highway === "footway" || tags.highway === "path" || tags.highway === "pedestrian"
      ? 0.16
      : 0;
  const maxspeed = Number(tags.maxspeed?.match(/\d+/)?.[0]);
  const speedPenalty = Number.isFinite(maxspeed) ? clamp((maxspeed - 25) / 120, 0, 0.2) : 0;

  return clamp(0.86 - exposure * 0.5 + sidewalkBonus + litBonus + pathBonus - speedPenalty, 0.05, 0.98);
}

function bikeScore(tags: OsmTags) {
  if (tags.highway === "cycleway" || tags.bicycle === "designated") {
    return 0.96;
  }

  if (tags.cycleway || tags["cycleway:left"] || tags["cycleway:right"]) {
    return 0.82;
  }

  if (tags.highway === "residential" || tags.highway === "living_street") {
    return 0.68;
  }

  if (tags.highway === "path" && tags.bicycle !== "no") {
    return 0.62;
  }

  if (tags.highway === "primary" || tags.highway === "secondary") {
    return 0.34;
  }

  return 0.52;
}

function walkScore(tags: OsmTags) {
  if (tags.highway === "footway" || tags.highway === "pedestrian" || tags.foot === "designated") {
    return 0.96;
  }

  if (tags.highway === "path" || tags.highway === "track") {
    return 0.9;
  }

  if (tags.sidewalk && tags.sidewalk !== "no") {
    return 0.78;
  }

  if (tags.highway === "residential" || tags.highway === "living_street") {
    return 0.7;
  }

  return 0.44;
}

function greenKind(tags: OsmTags): GreenFeature["kind"] {
  if (tags.natural === "water") {
    return "water";
  }

  if (tags.natural === "wood" || tags.landuse === "forest") {
    return "woods";
  }

  if (tags.leisure === "park" || tags.leisure === "nature_reserve") {
    return "park";
  }

  return "green";
}

function getGreenFeatures(elements: OsmElement[]): GreenFeature[] {
  return elements
    .filter((element) => element.type === "way" && element.geometry && !element.tags?.highway)
    .map((element) => ({
      geometry: element.geometry ?? [],
      tags: element.tags ?? {},
      kind: greenKind(element.tags ?? {}),
    }))
    .filter((feature) => feature.geometry.length >= 2);
}

function projectedOffsetM(origin: LatLng, point: LatLng) {
  const x =
    ((point.lng - origin.lng) * Math.PI * 6371000 * Math.cos((origin.lat * Math.PI) / 180)) /
    180;
  const y = ((point.lat - origin.lat) * Math.PI * 6371000) / 180;

  return { x, y };
}

function pointToSegmentDistanceM(point: LatLng, start: LatLng, end: LatLng) {
  const startVector = projectedOffsetM(point, start);
  const endVector = projectedOffsetM(point, end);
  const segmentX = endVector.x - startVector.x;
  const segmentY = endVector.y - startVector.y;
  const segmentLengthSquared = segmentX ** 2 + segmentY ** 2;

  if (segmentLengthSquared === 0) {
    return distanceM(point, start);
  }

  const projection = clamp(
    -(startVector.x * segmentX + startVector.y * segmentY) / segmentLengthSquared,
    0,
    1,
  );

  return Math.hypot(startVector.x + segmentX * projection, startVector.y + segmentY * projection);
}

function pointInPolygon(point: LatLng, polygon: LatLng[]) {
  let inside = false;

  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const currentPoint = polygon[current];
    const previousPoint = polygon[previous];
    const intersects =
      currentPoint.lng > point.lng !== previousPoint.lng > point.lng &&
      point.lat <
        ((previousPoint.lat - currentPoint.lat) * (point.lng - currentPoint.lng)) /
          (previousPoint.lng - currentPoint.lng) +
          currentPoint.lat;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function featureDistanceM(point: LatLng, feature: GreenFeature) {
  if (
    feature.geometry.length > 3 &&
    distanceM(feature.geometry[0], feature.geometry[feature.geometry.length - 1]) < 8 &&
    pointInPolygon(point, feature.geometry)
  ) {
    return 0;
  }

  return feature.geometry.slice(1).reduce((closest, geometryPoint, index) => {
    return Math.min(closest, pointToSegmentDistanceM(point, feature.geometry[index], geometryPoint));
  }, Number.POSITIVE_INFINITY);
}

function greenScores(point: LatLng, features: GreenFeature[]) {
  const nearby = features
    .map((feature) => ({
      feature,
      distanceM: featureDistanceM(point, feature),
    }))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 5);

  const strongest = nearby.reduce(
    (scores, item) => {
      const proximity = clamp(1 - item.distanceM / 300, 0, 1);
      const parkBoost = item.feature.kind === "park" || item.feature.kind === "woods" ? proximity : proximity * 0.45;
      const shadeBoost = item.feature.kind === "woods" ? proximity : item.feature.kind === "park" ? proximity * 0.72 : proximity * 0.28;
      const sceneryBoost = item.feature.kind === "water" ? proximity : proximity * 0.82;

      return {
        park: Math.max(scores.park, parkBoost),
        shade: Math.max(scores.shade, shadeBoost),
        scenery: Math.max(scores.scenery, sceneryBoost),
      };
    },
    { park: 0, shade: 0, scenery: 0 },
  );

  return strongest;
}

function midpoint(a: LatLng, b: LatLng) {
  return {
    lat: (a.lat + b.lat) / 2,
    lng: (a.lng + b.lng) / 2,
  };
}

function nodeKey(point: LatLng) {
  return `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
}

async function fetchOpenMeteoElevations(points: LatLng[]) {
  const unique = Array.from(new Map(points.map((point) => [nodeKey(point), point])).values()).slice(
    0,
    MAX_ELEVATION_POINTS,
  );
  const result = new Map<string, number>();

  for (let index = 0; index < unique.length; index += 100) {
    const chunk = unique.slice(index, index + 100);
    const params = new URLSearchParams({
      latitude: chunk.map((point) => point.lat.toFixed(6)).join(","),
      longitude: chunk.map((point) => point.lng.toFixed(6)).join(","),
    });

    const response = await fetch(`${ELEVATION_ENDPOINT}?${params}`, {
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`Elevation request failed with ${response.status}.`);
    }

    const data = (await response.json()) as { elevation?: number[] };

    chunk.forEach((point, chunkIndex) => {
      const elevation = data.elevation?.[chunkIndex];

      if (typeof elevation === "number") {
        result.set(nodeKey(point), elevation);
      }
    });
  }

  return result;
}

async function fetchOpenElevationElevations(points: LatLng[]) {
  const unique = Array.from(new Map(points.map((point) => [nodeKey(point), point])).values()).slice(
    0,
    MAX_ELEVATION_POINTS,
  );
  const result = new Map<string, number>();

  for (let index = 0; index < unique.length; index += 200) {
    const chunk = unique.slice(index, index + 200);
    const response = await fetch(OPEN_ELEVATION_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        locations: chunk.map((point) => ({
          latitude: point.lat,
          longitude: point.lng,
        })),
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Open-Elevation request failed with ${response.status}.`);
    }

    const data = (await response.json()) as {
      results?: Array<{ latitude: number; longitude: number; elevation: number }>;
    };

    data.results?.forEach((point) => {
      result.set(nodeKey({ lat: point.latitude, lng: point.longitude }), point.elevation);
    });
  }

  return result;
}

async function fetchElevations(points: LatLng[]) {
  try {
    return await fetchOpenMeteoElevations(points);
  } catch {
    return fetchOpenElevationElevations(points);
  }
}

function applyElevationsToEdges(edges: RouteEdge[], elevations: Map<string, number>) {
  if (elevations.size === 0) {
    return edges;
  }

  return edges.map((edge) => {
    const fromElevation = elevations.get(nodeKey(edge.geometry[0]));
    const toElevation = elevations.get(nodeKey(edge.geometry[edge.geometry.length - 1]));

    if (typeof fromElevation !== "number" || typeof toElevation !== "number") {
      return edge;
    }

    const elevationGainM = Math.round((toElevation - fromElevation) * 10) / 10;

    return {
      ...edge,
      elevationGainM,
      fromAbsElevM: fromElevation,
      toAbsElevM: toElevation,
      slope: edge.distanceM > 0 ? elevationGainM / edge.distanceM : 0,
    };
  });
}

function shadeScore(tags: OsmTags, greenShadeScore: number) {
  if (tags.covered === "yes" || tags.tunnel === "yes") {
    return 0.95;
  }

  if (tags.tree_lined === "yes") {
    return clamp(0.72 + greenShadeScore * 0.2, 0, 0.96);
  }

  const roadExposure = trafficExposure(tags);
  return clamp(0.35 + greenShadeScore * 0.58 - roadExposure * 0.18, 0.04, 0.96);
}

function createEdges(
  elements: OsmElement[],
  greenFeatures: GreenFeature[],
  elevations: Map<string, number>,
  preferences: UserPreferences,
) {
  const nodes = new Map<string, RouteNode>();
  const edges: RouteEdge[] = [];
  const highwayWays = elements.filter((element) => {
    const tags = element.tags ?? {};
    const lowValueService =
      tags.highway === "service" &&
      (tags.service === "parking_aisle" ||
        tags.service === "driveway" ||
        tags.service === "drive-through" ||
        tags.service === "parking");

    return (
      element.type === "way" &&
      tags.highway &&
      element.geometry &&
      !lowValueService &&
      accessAllowed(tags, preferences.activity)
    );
  });
  const nodeUseCount = new Map<number, number>();

  for (const way of highwayWays) {
    for (const nodeId of way.nodes ?? []) {
      nodeUseCount.set(nodeId, (nodeUseCount.get(nodeId) ?? 0) + 1);
    }
  }

  for (const way of highwayWays) {
    const geometry = way.geometry ?? [];
    const tags = way.tags ?? {};

    let segmentStartIndex = 0;
    let segmentDistanceM = 0;

    for (let index = 1; index < geometry.length; index += 1) {
      segmentDistanceM += distanceM(geometry[index - 1], geometry[index]);

      const osmNodeId = way.nodes?.[index];
      const shouldSplit =
        index === geometry.length - 1 ||
        (osmNodeId !== undefined && (nodeUseCount.get(osmNodeId) ?? 0) > 1) ||
        segmentDistanceM >= 280;

      if (segmentDistanceM < 2) {
        continue;
      }

      if (!shouldSplit) {
        continue;
      }

      const fromPoint = geometry[segmentStartIndex];
      const toPoint = geometry[index];
      const fromId = getNodeId(way, segmentStartIndex, fromPoint);
      const toId = getNodeId(way, index, toPoint);
      const edgeGeometry = geometry.slice(segmentStartIndex, index + 1);

      nodes.set(fromId, { id: fromId, point: fromPoint });
      nodes.set(toId, { id: toId, point: toPoint });

      const fromElevation = elevations.get(nodeKey(fromPoint));
      const toElevation = elevations.get(nodeKey(toPoint));
      const elevationGainM =
        typeof fromElevation === "number" && typeof toElevation === "number"
          ? Math.round((toElevation - fromElevation) * 10) / 10
          : 0;
      const greenery = greenScores(midpoint(fromPoint, toPoint), greenFeatures);
      const wayParkScore =
        tags.highway === "path" || tags.highway === "footway" || tags.highway === "cycleway"
          ? Math.max(greenery.park, 0.35)
          : greenery.park;
      const scenery = clamp(0.28 + greenery.scenery * 0.58 + (tags.name ? 0.08 : 0), 0, 0.98);

      edges.push({
        id: `osm-way-${way.id}-${segmentStartIndex}-${index}`,
        from: fromId,
        to: toId,
        distanceM: Math.round(segmentDistanceM),
        geometry: edgeGeometry,
        surfaceType: surfaceType(tags),
        roadType: roadType(tags),
        elevationGainM,
        slope: segmentDistanceM > 0 ? elevationGainM / segmentDistanceM : 0,
        parkScore: clamp(wayParkScore, 0, 0.98),
        shadeScore: shadeScore(tags, greenery.shade),
        safetyScore: accessAllowed(tags, preferences.activity) ? safetyScore(tags) : 0.03,
        sceneryScore: scenery,
        bikeScore: bikeScore(tags),
        walkScore: walkScore(tags),
        accessAllowed: accessAllowed(tags, preferences.activity),
        noveltyScore: clamp(0.36 + scenery * 0.38 + (tags.highway === "path" ? 0.16 : 0), 0, 0.98),
        trafficExposure: trafficExposure(tags),
        accessRestrictions: accessAllowed(tags, preferences.activity) ? undefined : [tags.access ?? "restricted"],
      });

      segmentStartIndex = index;
      segmentDistanceM = 0;
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
  };
}

function trimToLocalGraph(
  startPoint: LatLng,
  nodes: RouteNode[],
  edges: RouteEdge[],
  preferences: UserPreferences,
) {
  const radiusM = graphRadiusKm(preferences) * 1000;
  const maxEdges = preferences.activity === "cycling" ? 10000 : 6500;
  const localEdges = edges
    .filter((edge) => distanceM(startPoint, midpoint(edge.geometry[0], edge.geometry[edge.geometry.length - 1])) <= radiusM)
    .sort((a, b) => {
      const aMidpoint = midpoint(a.geometry[0], a.geometry[a.geometry.length - 1]);
      const bMidpoint = midpoint(b.geometry[0], b.geometry[b.geometry.length - 1]);
      const aQuality = a.parkScore + a.shadeScore + a.safetyScore + a.sceneryScore;
      const bQuality = b.parkScore + b.shadeScore + b.safetyScore + b.sceneryScore;

      return distanceM(startPoint, aMidpoint) - aQuality * 120 - (distanceM(startPoint, bMidpoint) - bQuality * 120);
    })
    .slice(0, maxEdges);
  const usedNodeIds = new Set(localEdges.flatMap((edge) => [edge.from, edge.to]));

  return {
    nodes: nodes.filter((node) => usedNodeIds.has(node.id)),
    edges: localEdges,
  };
}

function createAnchorEdge(
  id: string,
  from: RouteNode,
  to: RouteNode,
  nearbyEdges: RouteEdge[],
): RouteEdge {
  const connectorDistanceM = Math.max(1, Math.round(distanceM(from.point, to.point)));
  const referenceEdge =
    nearbyEdges.find((edge) => edge.from === to.id || edge.to === to.id) ?? nearbyEdges[0];

  return {
    id,
    from: from.id,
    to: to.id,
    distanceM: connectorDistanceM,
    geometry: [from.point, to.point],
    surfaceType: referenceEdge?.surfaceType ?? "paved",
    roadType: "connector",
    elevationGainM: 0,
    slope: 0,
    parkScore: referenceEdge?.parkScore ?? 0.35,
    shadeScore: referenceEdge?.shadeScore ?? 0.35,
    safetyScore: referenceEdge?.safetyScore ?? 0.7,
    sceneryScore: referenceEdge?.sceneryScore ?? 0.4,
    bikeScore: referenceEdge?.bikeScore ?? 0.55,
    walkScore: referenceEdge?.walkScore ?? 0.75,
    accessAllowed: true,
    noveltyScore: referenceEdge?.noveltyScore ?? 0.4,
    trafficExposure: referenceEdge?.trafficExposure ?? 0.18,
  };
}

function addAnchorNode(
  anchorId: string,
  point: LatLng | undefined,
  nodes: RouteNode[],
  edges: RouteEdge[],
) {
  if (!point) {
    return { nodes, edges };
  }

  const anchor: RouteNode = {
    id: anchorId,
    point,
  };
  const nearestNodes = nodes
    .map((node) => ({
      node,
      distanceM: distanceM(point, node.point),
    }))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 6);
  const connectorEdges = nearestNodes.map((item, index) =>
    createAnchorEdge(`${anchorId}-connector-${index}`, anchor, item.node, edges),
  );

  return {
    nodes: [anchor, ...nodes],
    edges: [...connectorEdges, ...edges],
  };
}

export async function loadOsmGraphNear(startPoint: LatLng, preferences: UserPreferences): Promise<RouteGraph> {
  const bbox = bboxAround(startPoint, graphRadiusKm(preferences));
  const elements = await fetchOverpassElements(bbox);
  const greenFeatures = getGreenFeatures(elements);
  const rawGraph = createEdges(elements, greenFeatures, new Map(), preferences);
  const trimmedGraph = trimToLocalGraph(startPoint, rawGraph.nodes, rawGraph.edges, preferences);
  let edges = trimmedGraph.edges;

  try {
    const elevations = await fetchElevations(
      trimmedGraph.nodes
        .map((node) => node.point)
        .sort((a, b) => distanceM(startPoint, a) - distanceM(startPoint, b)),
    );
    edges = applyElevationsToEdges(edges, elevations);
  } catch (error) {
    console.warn("Continuing without live elevation data.", error);
  }

  const withStartAnchor = addAnchorNode("user-start", startPoint, trimmedGraph.nodes, edges);
  const withEndAnchor = addAnchorNode(
    "user-end",
    preferences.endPoint,
    withStartAnchor.nodes,
    withStartAnchor.edges,
  );
  const nodes = withEndAnchor.nodes;
  edges = withEndAnchor.edges;

  if (nodes.length < 8 || edges.length < 8) {
    throw new Error("OSM returned too little routable graph data near the selected start point.");
  }

  return createGraph(nodes, createBidirectionalEdges(edges));
}
