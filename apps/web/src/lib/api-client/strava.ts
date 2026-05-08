import "client-only";

import type { ExternalRouteMock, LatLng } from "@/types/route";

export type StravaSegmentsSource = "strava-api" | "mock";
export type StravaSegmentsActivity = "all" | "running" | "riding";

export interface StravaSegmentsResult {
  source: StravaSegmentsSource;
  segments: ExternalRouteMock[];
  message?: string;
}

export async function loadStravaSegments({
  location,
  activity,
  radiusKm,
  limit,
  signal,
}: {
  location: LatLng;
  activity: StravaSegmentsActivity;
  radiusKm: number;
  limit: number;
  signal?: AbortSignal;
}): Promise<StravaSegmentsResult> {
  const params = new URLSearchParams({
    lat: String(location.lat),
    lng: String(location.lng),
    activity,
    radiusKm: String(radiusKm),
    limit: String(limit),
  });
  const response = await fetch(`/api/strava/segments?${params.toString()}`, {
    signal,
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as Partial<StravaSegmentsResult> | null;

  if (!response.ok || !data || !Array.isArray(data.segments)) {
    throw new Error(data?.message ?? "Could not load Strava segments.");
  }

  return {
    source: data.source ?? "mock",
    segments: data.segments,
    message: data.message,
  };
}
