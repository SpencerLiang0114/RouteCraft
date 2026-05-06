import { decodePolyline } from "./polyline";
import type { ExternalRouteMock, RouteAnalysisSignals } from "@/types/route";

const STRAVA_API_BASE = "https://www.strava.com/api/v3";

interface TokenState {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

let tokenState: TokenState = {
  accessToken: process.env.STRAVA_ACCESS_TOKEN,
  refreshToken: process.env.STRAVA_REFRESH_TOKEN,
};

interface StravaExplorerSegment {
  id: number;
  name: string;
  climb_category: number;
  climb_category_desc?: string;
  avg_grade: number;
  start_latlng: [number, number];
  end_latlng: [number, number];
  elev_difference: number;
  distance: number;
  points?: string;
  starred?: boolean;
}

interface StravaExplorerResponse {
  segments?: StravaExplorerSegment[];
}

export type StravaExploreActivity = "all" | "running" | "riding";

export interface StravaExploreResult {
  source: "strava-api" | "mock";
  segments: ExternalRouteMock[];
  message?: string;
}

export function hasStravaEnvironment() {
  return Boolean(
    process.env.STRAVA_CLIENT_ID &&
      process.env.STRAVA_CLIENT_SECRET &&
      process.env.STRAVA_ACCESS_TOKEN &&
      process.env.STRAVA_REFRESH_TOKEN,
  );
}

export async function exploreStravaSegments({
  bounds,
  activity,
}: {
  bounds: [number, number, number, number];
  activity: StravaExploreActivity;
}): Promise<StravaExploreResult> {
  if (!hasStravaEnvironment()) {
    return {
      source: "mock",
      segments: [],
      message: "Missing Strava environment variables.",
    };
  }

  const activities: Array<"running" | "riding"> =
    activity === "all" ? ["running", "riding"] : [activity];

  const responses = await Promise.all(activities.map((item) => fetchExplorerSegments(bounds, item)));
  const segments = responses.flatMap((response, index) =>
    normalizeExplorerSegments(response.segments ?? [], activities[index]),
  );

  return {
    source: "strava-api",
    segments,
  };
}

async function fetchExplorerSegments(
  bounds: [number, number, number, number],
  activity: "running" | "riding",
) {
  const params = new URLSearchParams({
    bounds: bounds.join(","),
    activity_type: activity,
  });
  const url = `${STRAVA_API_BASE}/segments/explore?${params.toString()}`;
  let response = await stravaFetch(url);

  if (response.status === 401) {
    await refreshAccessToken();
    response = await stravaFetch(url);
  }

  if (!response.ok) {
    throw new Error(`Strava segments request failed with ${response.status}.`);
  }

  return (await response.json()) as StravaExplorerResponse;
}

async function stravaFetch(url: string) {
  if (!tokenState.accessToken) {
    throw new Error("Missing Strava access token.");
  }

  return fetch(url, {
    headers: {
      Authorization: `Bearer ${tokenState.accessToken}`,
    },
    cache: "no-store",
  });
}

async function refreshAccessToken() {
  if (!process.env.STRAVA_CLIENT_ID || !process.env.STRAVA_CLIENT_SECRET || !tokenState.refreshToken) {
    throw new Error("Missing Strava refresh credentials.");
  }

  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: tokenState.refreshToken,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Strava token refresh failed with ${response.status}.`);
  }

  const token = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };

  tokenState = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: token.expires_at,
  };
}

function normalizeExplorerSegments(
  segments: StravaExplorerSegment[],
  activity: "running" | "riding",
): ExternalRouteMock[] {
  const normalized: ExternalRouteMock[] = [];

  for (const segment of segments) {
    const geometry = segment.points
      ? decodePolyline(segment.points)
      : [
          { lat: segment.start_latlng[0], lng: segment.start_latlng[1] },
          { lat: segment.end_latlng[0], lng: segment.end_latlng[1] },
        ];

    if (geometry.length < 2) {
      continue;
    }

    const activityType = activity === "riding" ? "cycling" : "running";
    const distanceKm = Math.round((segment.distance / 1000) * 10) / 10;
    const elevationGainM = Math.max(0, Math.round(segment.elev_difference));

    normalized.push({
      id: `strava-segment-${segment.id}`,
      source: "strava",
      name: segment.name,
      activity: activityType,
      distanceKm,
      elevationGainM,
      estimatedDurationMin: Math.max(
        1,
        Math.round(distanceKm * (activityType === "cycling" ? 3.1 : 5.6)),
      ),
      routeType: "point_to_point",
      geometry,
      signals: segmentSignals(segment),
    });
  }

  return normalized;
}

function segmentSignals(segment: StravaExplorerSegment): RouteAnalysisSignals {
  const climbPenalty = Math.min(28, Math.abs(segment.avg_grade) * 3 + segment.climb_category * 5);
  const sceneryBoost = Math.min(20, segment.climb_category * 4 + Math.abs(segment.avg_grade) * 1.5);

  return {
    parkAccess: 54,
    shadeCover: 44,
    roadExposure: 32,
    safety: Math.max(52, 76 - climbPenalty * 0.4),
    novelty: segment.starred ? 62 : 56,
    scenery: Math.min(88, 58 + sceneryBoost),
    surfaceQuality: 74,
    intersectionComplexity: 24,
  };
}
