import "client-only";

import type { RouteCandidate, SavedRoute } from "@/types/route";
import { apiFetch, readJson } from "./http";

export async function loadSavedRoutes(signal?: AbortSignal): Promise<SavedRoute[]> {
  const response = await apiFetch("/api/saved-routes", { signal });
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

export async function updateSavedRoute(
  id: string,
  patch: { name?: string; notes?: string | null },
): Promise<SavedRoute> {
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
    throw new Error("Could not delete saved route.");
  }
}
