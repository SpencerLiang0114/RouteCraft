import { apiFetch, apiUrl, readJson } from "./http";
import type { SavedRoute } from "@/types/route";

export interface ShareCreateResult {
  token: string;
  urlPath: string;
  expiresAt: string;
  routeId: string;
}

export interface SharedRoutePayload {
  token: string;
  routeId: string;
  name: string;
  expiresAt: string;
  route: SavedRoute;
}

export async function createShare(
  routeId: string,
  expiresInHours = 168,
): Promise<ShareCreateResult> {
  const response = await apiFetch(`/api/saved-routes/${encodeURIComponent(routeId)}/shares`, {
    method: "POST",
    body: JSON.stringify({ expiresInHours }),
  });
  return readJson<ShareCreateResult>(response, "Could not create share link.");
}

export async function revokeShare(routeId: string, token: string): Promise<void> {
  const response = await apiFetch(
    `/api/saved-routes/${encodeURIComponent(routeId)}/shares/${encodeURIComponent(token)}`,
    { method: "DELETE" },
  );
  if (!response.ok && response.status !== 204) {
    throw new Error("Could not revoke share link.");
  }
}

export async function loadShare(token: string, signal?: AbortSignal): Promise<SharedRoutePayload> {
  const response = await fetch(apiUrl(`/api/shares/${encodeURIComponent(token)}`), {
    signal,
    cache: "no-store",
  });
  return readJson<SharedRoutePayload>(response, "Could not load shared route.");
}
