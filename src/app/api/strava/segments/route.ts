import { NextResponse } from "next/server";
import { exploreStravaSegments, type StravaExploreActivity } from "@/backend/strava/stravaApi";
import { haversineDistanceKm } from "@/lib/geoUtils";
import type { ExternalRouteMock, LatLng } from "@/types/route";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const activity = normalizeActivity(searchParams.get("activity"));
  const radiusKm = clamp(Number(searchParams.get("radiusKm")) || 1.5, 0.5, 12);
  const segmentLimit = Math.round(clamp(Number(searchParams.get("limit")) || 20, 10, 40));

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json(
      { source: "mock", segments: [], message: "lat and lng are required." },
      { status: 400 },
    );
  }

  const center = { lat, lng };
  const radii = uniqueRadii([
    radiusKm,
    radiusKm * 1.5,
    radiusKm * 2.25,
    radiusKm * 3.5,
    radiusKm * 5,
    8,
    12,
  ]);
  const seen = new Map<string, ExternalRouteMock>();
  let source: "strava-api" | "mock" = "mock";
  let message: string | undefined;

  try {
    // Strava explore returns the top 10 segments per bounds request, without a per-page option.
    // Query expanding bounds so segments whose starts are farther away can still be recommended
    // when their decoded geometry passes through the requested radius.
    for (const radius of radii) {
      const result = await exploreStravaSegments({
        bounds: boundsAround(center, radius),
        activity,
      });

      source = result.source;
      message = result.message;

      for (const segment of result.segments) {
        seen.set(segment.id, segment);
      }

      const matchingSegments = segmentsWithinRadius(center, Array.from(seen.values()), radiusKm, segmentLimit);

      if (source !== "strava-api" || matchingSegments.length >= segmentLimit) {
        break;
      }
    }

    return NextResponse.json({
      source,
      segments: segmentsWithinRadius(center, Array.from(seen.values()), radiusKm, segmentLimit),
      message,
    });
  } catch (error) {
    if (seen.size > 0) {
      return NextResponse.json({
        source,
        segments: segmentsWithinRadius(center, Array.from(seen.values()), radiusKm, segmentLimit),
        message:
          error instanceof Error
            ? `${error.message} Returning the segments loaded before the request failed.`
            : "Returning the segments loaded before the request failed.",
      });
    }

    return NextResponse.json(
      {
        source: "mock",
        segments: [],
        message: error instanceof Error ? error.message : "Could not load Strava segments.",
      },
      { status: 200 },
    );
  }
}

function normalizeActivity(value: string | null): StravaExploreActivity {
  if (value === "running" || value === "riding") {
    return value;
  }

  return "all";
}

function segmentsWithinRadius(
  center: LatLng,
  segments: ExternalRouteMock[],
  radiusKm: number,
  limit: number,
) {
  return segments
    .map((segment) => ({
      segment,
      distanceToStartKm: haversineDistanceKm(center, segment.geometry[0]),
      distanceToRouteKm: minRouteDistanceKm(center, segment),
    }))
    .filter(({ distanceToRouteKm }) => distanceToRouteKm <= radiusKm)
    .sort((a, b) => {
      const routeDistance = a.distanceToRouteKm - b.distanceToRouteKm;
      return routeDistance === 0 ? a.distanceToStartKm - b.distanceToStartKm : routeDistance;
    })
    .slice(0, limit)
    .map(({ segment }) => segment);
}

function boundsAround(center: LatLng, radiusKm: number): [number, number, number, number] {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((center.lat * Math.PI) / 180));

  return [
    center.lat - latDelta,
    center.lng - lngDelta,
    center.lat + latDelta,
    center.lng + lngDelta,
  ];
}

function minRouteDistanceKm(point: LatLng, route: ExternalRouteMock) {
  return route.geometry.reduce((closest, routePoint, index) => {
    const pointDistanceKm = haversineDistanceKm(point, routePoint);

    if (index === 0) {
      return pointDistanceKm;
    }

    return Math.min(
      closest,
      pointDistanceKm,
      pointToSegmentDistanceKm(point, route.geometry[index - 1], routePoint),
    );
  }, Number.POSITIVE_INFINITY);
}

function pointToSegmentDistanceKm(point: LatLng, start: LatLng, end: LatLng) {
  const startVector = projectedOffsetKm(point, start);
  const endVector = projectedOffsetKm(point, end);
  const segmentX = endVector.x - startVector.x;
  const segmentY = endVector.y - startVector.y;
  const segmentLengthSquared = segmentX ** 2 + segmentY ** 2;

  if (segmentLengthSquared === 0) {
    return haversineDistanceKm(point, start);
  }

  const projection = clamp(
    -(startVector.x * segmentX + startVector.y * segmentY) / segmentLengthSquared,
    0,
    1,
  );
  const closestX = startVector.x + segmentX * projection;
  const closestY = startVector.y + segmentY * projection;

  return Math.sqrt(closestX ** 2 + closestY ** 2);
}

function projectedOffsetKm(origin: LatLng, point: LatLng) {
  const kmPerDegreeLat = 111.32;
  const kmPerDegreeLng = kmPerDegreeLat * Math.cos((origin.lat * Math.PI) / 180);

  return {
    x: (point.lng - origin.lng) * kmPerDegreeLng,
    y: (point.lat - origin.lat) * kmPerDegreeLat,
  };
}

function uniqueRadii(radii: number[]) {
  return Array.from(new Set(radii.map((radius) => Math.round(clamp(radius, 0.5, 12) * 10) / 10))).sort(
    (a, b) => a - b,
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
