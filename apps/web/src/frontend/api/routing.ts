import "client-only";

import type { RouteCandidate, UserPreferences } from "@/types/route";

const DEFAULT_ROUTECRAFT_API_URL = "http://localhost:18080";

function apiUrl(path: string) {
  const baseUrl = process.env.NEXT_PUBLIC_ROUTECRAFT_API_URL ?? DEFAULT_ROUTECRAFT_API_URL;
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

export interface GenerateRoutesResult {
  routes: RouteCandidate[];
  message?: string;
}

export async function generateRoutes(preferences: UserPreferences): Promise<GenerateRoutesResult> {
  const response = await fetch(apiUrl("/api/routing/generate"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(preferences),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => null)) as
    | (Partial<GenerateRoutesResult> & { message?: string })
    | null;

  if (!response.ok || !data || !Array.isArray(data.routes)) {
    const message = data && typeof data.message === "string"
      ? data.message
      : "Could not generate routes.";
    throw new Error(message);
  }

  return {
    routes: data.routes,
    message: data.message,
  };
}
