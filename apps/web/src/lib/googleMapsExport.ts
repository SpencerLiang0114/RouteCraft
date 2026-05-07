import type { LatLng, RouteCandidate } from "@/types/route";

const MAX_GOOGLE_MAPS_WAYPOINTS = 9;

function pointParam(point: LatLng) {
  return `${formatCoordinate(point.lat)},${formatCoordinate(point.lng)}`;
}

function formatCoordinate(value: number) {
  return Number(value.toFixed(6)).toString();
}

function selectGeometryWaypoints(geometry: LatLng[]) {
  const middlePoints = geometry.slice(1, -1);
  const count = Math.min(MAX_GOOGLE_MAPS_WAYPOINTS, middlePoints.length);

  if (count === middlePoints.length) {
    return middlePoints;
  }

  return Array.from({ length: count }, (_, index) => {
    const pointIndex = Math.floor(((index + 1) * middlePoints.length) / (count + 1));
    return middlePoints[pointIndex];
  });
}

export function createGoogleMapsDirectionsUrl(route: RouteCandidate) {
  const [origin, ...rest] = route.geometry;
  const destination = rest.at(-1) ?? origin;
  const waypoints = selectGeometryWaypoints(route.geometry);
  const travelmode = route.activity === "cycling" ? "bicycling" : "walking";
  const params = new URLSearchParams({
    api: "1",
    origin: pointParam(origin),
    destination: pointParam(destination),
    travelmode,
  });

  if (waypoints.length > 0) {
    params.set("waypoints", waypoints.map(pointParam).join("|"));
  }

  // Google Maps may recalculate for convenience navigation. GPX/KML export preserves route geometry.
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
