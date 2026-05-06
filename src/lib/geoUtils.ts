import type { ActivityType, LatLng, RouteSource } from "@/types/route";

const EARTH_RADIUS_KM = 6371;

export function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function haversineDistanceKm(a: LatLng, b: LatLng) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const latA = toRadians(a.lat);
  const latB = toRadians(b.lat);

  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function calculateRouteDistanceKm(geometry: LatLng[]) {
  return round(
    geometry.reduce((total, point, index) => {
      if (index === 0) {
        return total;
      }
      return total + haversineDistanceKm(geometry[index - 1], point);
    }, 0),
    1,
  );
}

export function estimateDurationMin(activity: ActivityType, distanceKm: number) {
  const minutesPerKm: Record<ActivityType, number> = {
    running: 5.6,
    hiking: 12.5,
    cycling: 3.1,
  };

  return Math.max(1, Math.round(distanceKm * minutesPerKm[activity]));
}

export function formatActivity(activity: ActivityType) {
  return activity.charAt(0).toUpperCase() + activity.slice(1);
}

export function formatSource(source: RouteSource) {
  const labels: Record<RouteSource, string> = {
    generated: "Generated",
    strava: "Strava",
    alltrails: "AllTrails",
    uploaded: "Uploaded",
  };

  return labels[source];
}

export function formatRouteType(routeType?: string) {
  if (!routeType) {
    return "Route";
  }
  return routeType.replaceAll("_", " ");
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getRouteBounds(routes: LatLng[][]) {
  const points = routes.flat();

  if (points.length === 0) {
    return {
      minLat: 0,
      maxLat: 1,
      minLng: 0,
      maxLng: 1,
    };
  }

  return points.reduce(
    (bounds, point) => ({
      minLat: Math.min(bounds.minLat, point.lat),
      maxLat: Math.max(bounds.maxLat, point.lat),
      minLng: Math.min(bounds.minLng, point.lng),
      maxLng: Math.max(bounds.maxLng, point.lng),
    }),
    {
      minLat: points[0].lat,
      maxLat: points[0].lat,
      minLng: points[0].lng,
      maxLng: points[0].lng,
    },
  );
}
