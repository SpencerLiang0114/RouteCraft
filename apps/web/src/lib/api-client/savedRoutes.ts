import "client-only";

import type { ActivityType, RouteCandidate, SavedRoute } from "@/types/route";
import { apiFetch, readJson } from "./http";

export type SavedRoutesSort = "newest" | "distance" | "elevation";

export interface SavedRoutesQuery {
  q?: string;
  activity?: ActivityType | "";
  folder?: string;
  tag?: string;
  minDistanceKm?: number;
  maxDistanceKm?: number;
  minElevationM?: number;
  maxElevationM?: number;
  savedAfter?: string;
  savedBefore?: string;
  sort?: SavedRoutesSort;
}

export type SavedRoutePatch = Partial<
  Pick<SavedRoute, "name" | "notes" | "tags" | "folder" | "visibility">
>;

function buildQueryString(query?: SavedRoutesQuery) {
  if (!query) {
    return "";
  }

  const params = new URLSearchParams();
  const entries: Array<[string, string | number | undefined]> = [
    ["q", query.q],
    ["activity", query.activity],
    ["folder", query.folder],
    ["tag", query.tag],
    ["minDistanceKm", query.minDistanceKm],
    ["maxDistanceKm", query.maxDistanceKm],
    ["minElevationM", query.minElevationM],
    ["maxElevationM", query.maxElevationM],
    ["savedAfter", query.savedAfter],
    ["savedBefore", query.savedBefore],
    ["sort", query.sort],
  ];

  for (const [key, value] of entries) {
    if (value === undefined || value === "") {
      continue;
    }
    params.set(key, String(value));
  }

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function loadSavedRoutes(
  query?: SavedRoutesQuery,
  signal?: AbortSignal,
): Promise<SavedRoute[]> {
  const response = await apiFetch(`/api/saved-routes${buildQueryString(query)}`, { signal });
  const data = await readJson<unknown>(response, "Could not load saved routes.");

  if (!Array.isArray(data)) {
    throw new Error("Saved routes response was not an array.");
  }

  return data as SavedRoute[];
}

export async function loadSavedRoute(id: string, signal?: AbortSignal): Promise<SavedRoute | null> {
  const response = await apiFetch(`/api/saved-routes/${encodeURIComponent(id)}`, { signal });

  if (response.status === 404) {
    return null;
  }

  return readJson<SavedRoute>(response, "Could not load saved route.");
}

export async function saveRoute(route: RouteCandidate): Promise<SavedRoute> {
  const savedRoute: SavedRoute = {
    ...route,
    savedAt: new Date().toISOString(),
  };
  const response = await apiFetch("/api/saved-routes", {
    method: "POST",
    body: JSON.stringify(savedRoute),
  });

  return readJson<SavedRoute>(response, "Could not save route.");
}

export async function updateSavedRoute(id: string, patch: SavedRoutePatch): Promise<SavedRoute> {
  const response = await apiFetch(`/api/saved-routes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return readJson<SavedRoute>(response, "Could not update saved route.");
}

export async function deleteSavedRoute(id: string): Promise<void> {
  const response = await apiFetch(`/api/saved-routes/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 204) {
    await readJson(response, "Could not delete saved route.");
  }
}

export async function duplicateSavedRoute(id: string): Promise<SavedRoute> {
  const response = await apiFetch(`/api/saved-routes/${encodeURIComponent(id)}/duplicate`, {
    method: "POST",
  });
  return readJson<SavedRoute>(response, "Could not duplicate saved route.");
}
