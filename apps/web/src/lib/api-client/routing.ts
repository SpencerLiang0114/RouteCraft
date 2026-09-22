import "client-only";

import type { RouteCandidate, UserPreferences } from "@/types/route";
import { apiFetch, apiUrl, readJson } from "./http";

export { apiUrl };

export interface GenerateRoutesResult {
  routes: RouteCandidate[];
  message?: string;
}

export async function generateRoutes(preferences: UserPreferences): Promise<GenerateRoutesResult> {
  // Public endpoint — no auth/CSRF required so the wizard keeps working.
  const response = await fetch(apiUrl("/api/routing/generate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(preferences),
    cache: "no-store",
  });

  const data = await readJson<Partial<GenerateRoutesResult> & { message?: string }>(
    response,
    "Could not generate routes.",
  );

  if (!Array.isArray(data.routes)) {
    throw new Error(data.message ?? "Could not generate routes.");
  }

  return {
    routes: data.routes,
    message: data.message,
  };
}

/** Authenticated optional: sends session cookie when present so live Strava tokens apply. */
export async function apiGet(path: string, signal?: AbortSignal): Promise<Response> {
  return apiFetch(path, { signal });
}
