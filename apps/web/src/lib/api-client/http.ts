const DEFAULT_ROUTECRAFT_API_URL = "http://localhost:18080";

export function apiUrl(path: string) {
  const baseUrl = process.env.NEXT_PUBLIC_ROUTECRAFT_API_URL?.trim() || DEFAULT_ROUTECRAFT_API_URL;
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

let csrfToken: string | null = null;

export function clearCsrfToken() {
  csrfToken = null;
}

async function ensureCsrfToken(): Promise<string> {
  if (csrfToken) {
    return csrfToken;
  }
  const response = await fetch(apiUrl("/api/auth/csrf"), {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Could not obtain CSRF token.");
  }
  const data = (await response.json()) as { token?: string };
  if (!data.token) {
    throw new Error("CSRF token missing.");
  }
  csrfToken = data.token;
  return csrfToken;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const needsCsrf = !["GET", "HEAD", "OPTIONS", "TRACE"].includes(method);
  if (needsCsrf) {
    headers.set("X-XSRF-TOKEN", await ensureCsrfToken());
  }

  const response = await fetch(apiUrl(path), {
    ...init,
    headers,
    credentials: "include",
    cache: init.cache ?? "no-store",
  });

  // Token may rotate after login/logout; refresh once on CSRF failure.
  if (needsCsrf && response.status === 403) {
    clearCsrfToken();
    headers.set("X-XSRF-TOKEN", await ensureCsrfToken());
    return fetch(apiUrl(path), {
      ...init,
      headers,
      credentials: "include",
      cache: init.cache ?? "no-store",
    });
  }

  return response;
}

export async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data
        ? String((data as { message: unknown }).message)
        : fallbackMessage;
    throw new Error(message || fallbackMessage);
  }
  return data as T;
}
