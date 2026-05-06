import type { LatLng } from "@/types/route";
import type { RouteEdge, RouteNode } from "./graph";
import { createBidirectionalEdges, createGraph } from "./graph";
import { bearingDegrees, destinationPoint, distanceM, resolveTargetDistanceKm } from "./geoUtils";
import type { UserPreferences } from "@/types/route";

const BEARINGS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
const BASE_RADII_M = [650, 1200, 1900, 2800, 3900, 5400, 7200, 9600, 12500, 16500];

function ringNodeId(ringIndex: number, bearing: number) {
  return `r${ringIndex}-${bearing}`;
}

function scoreForBearing(bearing: number, radiusM: number) {
  const isParkCorridor = bearing >= 30 && bearing <= 150;
  const isOpenWaterfront = bearing >= 240 && bearing <= 300;
  const isArterial = bearing >= 180 && bearing <= 240 && radiusM < 5400;
  const isOuterTrail = radiusM >= 5400 && (bearing <= 90 || bearing >= 300);

  if (isOuterTrail) {
    return {
      roadType: "trail",
      surfaceType: "dirt",
      parkScore: 0.86,
      shadeScore: 0.76,
      safetyScore: 0.78,
      sceneryScore: 0.9,
      bikeScore: 0.54,
      walkScore: 0.94,
      noveltyScore: 0.88,
      trafficExposure: 0.04,
    };
  }

  if (isParkCorridor) {
    return {
      roadType: "park_path",
      surfaceType: "paved",
      parkScore: 0.9,
      shadeScore: 0.82,
      safetyScore: 0.86,
      sceneryScore: 0.84,
      bikeScore: 0.78,
      walkScore: 0.93,
      noveltyScore: 0.72,
      trafficExposure: 0.06,
    };
  }

  if (isOpenWaterfront) {
    return {
      roadType: "greenway",
      surfaceType: "paved",
      parkScore: 0.68,
      shadeScore: 0.38,
      safetyScore: 0.82,
      sceneryScore: 0.92,
      bikeScore: 0.84,
      walkScore: 0.82,
      noveltyScore: 0.7,
      trafficExposure: 0.08,
    };
  }

  if (isArterial) {
    return {
      roadType: "arterial",
      surfaceType: "sidewalk",
      parkScore: 0.18,
      shadeScore: 0.28,
      safetyScore: 0.46,
      sceneryScore: 0.36,
      bikeScore: 0.42,
      walkScore: 0.5,
      noveltyScore: 0.28,
      trafficExposure: 0.72,
    };
  }

  return {
    roadType: "residential",
    surfaceType: "sidewalk",
    parkScore: 0.36,
    shadeScore: 0.48,
    safetyScore: 0.72,
    sceneryScore: 0.5,
    bikeScore: 0.64,
    walkScore: 0.76,
    noveltyScore: 0.48,
    trafficExposure: 0.24,
  };
}

function elevationGainForSegment(from: LatLng, to: LatLng) {
  const bearing = bearingDegrees(from, to);
  const uphillBias = Math.cos((bearing * Math.PI) / 180) * 0.018 + Math.sin((bearing * Math.PI) / 180) * 0.01;
  const segmentDistanceM = distanceM(from, to);

  return Math.round(segmentDistanceM * uphillBias * 10) / 10;
}

function createEdge(
  id: string,
  from: RouteNode,
  to: RouteNode,
  metadata: ReturnType<typeof scoreForBearing>,
  accessAllowed = true,
): RouteEdge {
  const segmentDistanceM = distanceM(from.point, to.point);
  const elevationGainM = elevationGainForSegment(from.point, to.point);

  return {
    id,
    from: from.id,
    to: to.id,
    distanceM: Math.round(segmentDistanceM),
    geometry: [from.point, to.point],
    surfaceType: metadata.surfaceType,
    roadType: metadata.roadType,
    elevationGainM,
    slope: segmentDistanceM > 0 ? elevationGainM / segmentDistanceM : 0,
    parkScore: metadata.parkScore,
    shadeScore: metadata.shadeScore,
    safetyScore: accessAllowed ? metadata.safetyScore : 0.05,
    sceneryScore: metadata.sceneryScore,
    bikeScore: metadata.bikeScore,
    walkScore: metadata.walkScore,
    accessAllowed,
    noveltyScore: metadata.noveltyScore,
    trafficExposure: metadata.trafficExposure,
    accessRestrictions: accessAllowed ? undefined : ["private"],
  };
}

function connect(
  edges: RouteEdge[],
  nodes: Record<string, RouteNode>,
  fromId: string,
  toId: string,
  id: string,
  accessAllowed = true,
) {
  const from = nodes[fromId];
  const to = nodes[toId];

  if (!from || !to) {
    return;
  }

  const midpointBearing = bearingDegrees(nodes.center.point, {
    lat: (from.point.lat + to.point.lat) / 2,
    lng: (from.point.lng + to.point.lng) / 2,
  });
  const midpointDistance = distanceM(nodes.center.point, {
    lat: (from.point.lat + to.point.lat) / 2,
    lng: (from.point.lng + to.point.lng) / 2,
  });

  edges.push(createEdge(id, from, to, scoreForBearing(midpointBearing, midpointDistance), accessAllowed));
}

function addUserEndNode(
  nodes: Record<string, RouteNode>,
  edges: RouteEdge[],
  endPoint: LatLng | undefined,
) {
  if (!endPoint) {
    return;
  }

  const endNode: RouteNode = {
    id: "user-end",
    point: endPoint,
  };

  nodes[endNode.id] = endNode;

  const nearest = Object.values(nodes)
    .filter((node) => node.id !== endNode.id)
    .map((node) => ({
      node,
      distanceM: distanceM(endPoint, node.point),
    }))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 4);

  nearest.forEach((item, index) => {
    connect(edges, nodes, item.node.id, endNode.id, `end-link-${index}`);
  });
}

export function loadMockGraphNear(
  startPoint: LatLng,
  preferences?: UserPreferences,
) {
  const targetDistanceKm = preferences ? resolveTargetDistanceKm(preferences) : 8;
  const maxUsefulRadiusM = Math.max(5000, targetDistanceKm * 1000 * 0.48);
  const radii = BASE_RADII_M.filter((radius) => radius <= maxUsefulRadiusM + 4500);
  const nodes: Record<string, RouteNode> = {
    center: {
      id: "center",
      point: startPoint,
    },
  };
  const directedEdges: RouteEdge[] = [];

  radii.forEach((radius, ringIndex) => {
    for (const bearing of BEARINGS) {
      const id = ringNodeId(ringIndex, bearing);
      nodes[id] = {
        id,
        point: destinationPoint(startPoint, bearing, radius),
      };
    }
  });

  for (const bearing of BEARINGS) {
    connect(directedEdges, nodes, "center", ringNodeId(0, bearing), `spoke-center-${bearing}`);
  }

  radii.forEach((_, ringIndex) => {
    for (const bearing of BEARINGS) {
      const currentIndex = BEARINGS.indexOf(bearing);
      const nextBearing = BEARINGS[(currentIndex + 1) % BEARINGS.length];
      const currentId = ringNodeId(ringIndex, bearing);
      const nextId = ringNodeId(ringIndex, nextBearing);
      const restricted = ringIndex === 1 && bearing === 210;

      connect(directedEdges, nodes, currentId, nextId, `ring-${ringIndex}-${bearing}`, !restricted);

      if (ringIndex < radii.length - 1) {
        connect(
          directedEdges,
          nodes,
          currentId,
          ringNodeId(ringIndex + 1, bearing),
          `radial-${ringIndex}-${bearing}`,
        );

        if (currentIndex % 2 === 0) {
          connect(
            directedEdges,
            nodes,
            currentId,
            ringNodeId(ringIndex + 1, nextBearing),
            `diagonal-${ringIndex}-${bearing}`,
          );
        }
      }
    }
  });

  addUserEndNode(nodes, directedEdges, preferences?.endPoint);

  return createGraph(Object.values(nodes), createBidirectionalEdges(directedEdges));
}
