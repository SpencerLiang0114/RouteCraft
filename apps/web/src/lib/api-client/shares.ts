import { apiFetch, apiUrl, readJson } from "./http";
import type { SavedRoute } from "@/types/route";

export interface ShareCreateResult {
  token: string;
  urlPath: string;
  expiresAt: string | null;
}

export interface SharedRoutePayload {
  route: SavedRoute;
  token: string;
  expiresAt: string | null;
  sharedByDisplayName?: string | null;
}

export async function createShare(
  routeId: string,
  options?: { expiresInHours?: number | null },
): Promise<ShareCreateResult> {
  const response = await apiFetch(`/api/saved-routes/${encodeURIComponent(routeId)}/shares`, {
    method: "POST",
    body: JSON.stringify({
      expiresInHours: options?.expiresInHours ?? null,
    }),
  });
  return readJson<ShareCreateResult>(response, "Could not create share link.");
}

export async function loadShare(
  token: string,
  signal?: AbortSignal,
): Promise<SharedRoutePayload> {
  const response = await fetch(apiUrl(`/api/shares/${encodeURIComponent(token)}`), {
    signal,
    cache: "no-store",
  });
  return readJson<SharedRoutePayload>(response, "Could not load shared route.");
}
