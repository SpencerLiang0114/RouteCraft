import "client-only";

import { apiFetch, clearCsrfToken, readJson } from "./http";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

export async function register(input: {
  email: string;
  password: string;
  displayName: string;
}): Promise<AuthUser> {
  clearCsrfToken();
  const response = await apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
  clearCsrfToken();
  return readJson<AuthUser>(response, "Could not register.");
}

export async function login(input: { email: string; password: string }): Promise<AuthUser> {
  clearCsrfToken();
  const response = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
  clearCsrfToken();
  return readJson<AuthUser>(response, "Could not log in.");
}

export async function logout(): Promise<void> {
  const response = await apiFetch("/api/auth/logout", { method: "POST" });
  clearCsrfToken();
  if (!response.ok && response.status !== 204) {
    throw new Error("Could not log out.");
  }
}

export async function getMe(signal?: AbortSignal): Promise<AuthUser | null> {
  const response = await apiFetch("/api/auth/me", { signal });
  if (response.status === 401) {
    return null;
  }
  return readJson<AuthUser>(response, "Could not load current user.");
}

export async function getStravaConnectUrl(): Promise<string> {
  const response = await apiFetch("/api/auth/strava/connect");
  const data = await readJson<{ authorizeUrl: string }>(response, "Could not start Strava connect.");
  return data.authorizeUrl;
}

export async function getStravaStatus(): Promise<{ connected: boolean; oauthConfigured: boolean }> {
  const response = await apiFetch("/api/auth/strava/status");
  return readJson(response, "Could not load Strava status.");
}
