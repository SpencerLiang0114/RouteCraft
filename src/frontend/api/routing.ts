import "client-only";

import type { RouteCandidate, UserPreferences } from "@/types/route";

export interface GenerateRoutesResult {
  routes: RouteCandidate[];
  message?: string;
}

export async function generateRoutes(preferences: UserPreferences): Promise<GenerateRoutesResult> {
  const response = await fetch("/api/routing/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(preferences),
    cache: "no-store",
  });
  const data = (await response.json()) as Partial<GenerateRoutesResult>;

  if (!response.ok || !Array.isArray(data.routes)) {
    throw new Error(data.message ?? "Could not generate routes.");
  }

  return {
    routes: data.routes,
    message: data.message,
  };
}
