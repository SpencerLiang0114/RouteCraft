import type { RouteCandidate } from "@/types/route";

function pointParam(point: { lat: number; lng: number }) {
  return `${point.lat},${point.lng}`;
}

export function createGoogleMapsDirectionsUrl(route: RouteCandidate) {
  const [origin, ...rest] = route.geometry;
  const destination = rest.at(-1) ?? origin;
  const middlePoints = rest.slice(0, -1);
  const waypoints = route.waypoints?.length ? route.waypoints : middlePoints.slice(0, 8);
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
