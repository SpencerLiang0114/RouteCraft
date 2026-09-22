const DEFAULT_ROUTECRAFT_API_URL = "http://localhost:18080";

export function apiUrl(path: string) {
  const baseUrl = process.env.NEXT_PUBLIC_ROUTECRAFT_API_URL?.trim() || DEFAULT_ROUTECRAFT_API_URL;
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(apiUrl(path), {
    ...init,
    headers,
    credentials: "include",
    cache: init.cache ?? "no-store",
  });
}

export async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data
        ? String(data.message)
        : fallbackMessage;
    throw new Error(message);
  }
  return data as T;
}
