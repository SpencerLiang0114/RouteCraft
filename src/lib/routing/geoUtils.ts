import type { ActivityType, LatLng, UserPreferences } from "@/types/route";
import { haversineDistanceKm, round } from "@/lib/geoUtils";

const EARTH_RADIUS_M = 6371000;
const FALLBACK_TARGET_DISTANCE_KM = 8;

export function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

export function toDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

export function normalizePreference(value: number | undefined) {
  if (value === undefined) {
    return 0.5;
  }

  if (value <= 1) {
    return Math.max(0, Math.min(1, value));
  }

  return Math.max(0, Math.min(1, (value - 1) / 2));
}

export function activityPaceMinPerKm(activity: ActivityType) {
  const paces: Record<ActivityType, number> = {
    running: 5.6,
    hiking: 12.5,
    cycling: 3.1,
  };

  return paces[activity];
}

export function resolveTargetDistanceKm(preferences: UserPreferences) {
  if (preferences.targetDistanceKm && preferences.targetDistanceKm > 0) {
    return preferences.targetDistanceKm;
  }

  if (preferences.targetDurationMin && preferences.targetDurationMin > 0) {
    return round(preferences.targetDurationMin / activityPaceMinPerKm(preferences.activity), 1);
  }

  return FALLBACK_TARGET_DISTANCE_KM;
}

export function distanceToleranceRatio(targetDistanceKm: number) {
  // ±500 m expressed as a proportion of target distance
  return 0.5 / targetDistanceKm;
}

export function distanceM(a: LatLng, b: LatLng) {
  return haversineDistanceKm(a, b) * 1000;
}

export function calculateGeometryDistanceM(geometry: LatLng[]) {
  return geometry.reduce((total, point, index) => {
    if (index === 0) {
      return total;
    }

    return total + distanceM(geometry[index - 1], point);
  }, 0);
}

export function bearingDegrees(from: LatLng, to: LatLng) {
  const startLat = toRadians(from.lat);
  const endLat = toRadians(to.lat);
  const deltaLng = toRadians(to.lng - from.lng);

  const y = Math.sin(deltaLng) * Math.cos(endLat);
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLng);

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

export function destinationPoint(start: LatLng, bearing: number, meters: number): LatLng {
  const angularDistance = meters / EARTH_RADIUS_M;
  const bearingRad = toRadians(bearing);
  const latRad = toRadians(start.lat);
  const lngRad = toRadians(start.lng);

  const destLat = Math.asin(
    Math.sin(latRad) * Math.cos(angularDistance) +
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearingRad),
  );

  const destLng =
    lngRad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(destLat),
    );

  return {
    lat: round(toDegrees(destLat), 6),
    lng: round(toDegrees(destLng), 6),
  };
}

export function angularDifference(a: number, b: number) {
  const difference = Math.abs(a - b) % 360;
  return difference > 180 ? 360 - difference : difference;
}

export function weightedAverage(
  values: Array<{ value: number; weight: number }>,
  fallback = 0,
) {
  const totalWeight = values.reduce((total, item) => total + item.weight, 0);

  if (totalWeight <= 0) {
    return fallback;
  }

  return values.reduce((total, item) => total + item.value * item.weight, 0) / totalWeight;
}

export function isAfternoonDeparture(departureTime: string) {
  const value = departureTime.toLowerCase();
  return value.includes("afternoon") || value.includes("12:") || value.includes("13:") || value.includes("14:") || value.includes("15:");
}

export function isNightDeparture(departureTime: string) {
  const value = departureTime.toLowerCase();
  return value.includes("night") || value.includes("late") || value.includes("22:") || value.includes("23:");
}

export function undirectedEdgeKey(from: string, to: string) {
  return [from, to].sort().join("<>");
}

export function routeTypeLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function wantsClimbing(preferences: UserPreferences) {
  return preferences.routeStyle === "climbing";
}
