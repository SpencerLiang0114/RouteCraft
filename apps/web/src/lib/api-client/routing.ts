import "client-only";

import type { RouteCandidate, UserPreferences } from "@/types/route";
import { apiFetch, apiUrl, readJson } from "./http";

export { apiUrl };

export interface GenerateRoutesResult {
  routes: RouteCandidate[];
  message?: string;
}

export async function generateRoutes(preferences: UserPreferences): Promise<GenerateRoutesResult> {
  const response = await apiFetch("/api/routing/generate", {
    method: "POST",
    body: JSON.stringify(preferences),
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
