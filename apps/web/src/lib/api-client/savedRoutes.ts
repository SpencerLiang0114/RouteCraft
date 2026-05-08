import "client-only";

import type { RouteCandidate, SavedRoute } from "@/types/route";
import { apiUrl } from "./routing";

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data === "object" && "message" in data
      ? String(data.message)
      : fallbackMessage;
    throw new Error(message);
  }
  return data as T;
}

export async function loadSavedRoutes(signal?: AbortSignal): Promise<SavedRoute[]> {
  const response = await fetch(apiUrl("/api/saved-routes"), {
    cache: "no-store",
    signal,
  });
  const data = await readJson<unknown>(response, "Could not load saved routes.");

  if (!Array.isArray(data)) {
    throw new Error("Saved routes response was not an array.");
  }

  return data as SavedRoute[];
}

export async function loadSavedRoute(id: string, signal?: AbortSignal): Promise<SavedRoute | null> {
  const response = await fetch(apiUrl(`/api/saved-routes/${encodeURIComponent(id)}`), {
    cache: "no-store",
    signal,
  });

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
  const response = await fetch(apiUrl("/api/saved-routes"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(savedRoute),
  });

  return readJson<SavedRoute>(response, "Could not save route.");
}
