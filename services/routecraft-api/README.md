# RouteCraft API

Spring Boot public API for RouteCraft. Default listen port is **18080** (`SERVER_PORT`, see `application.properties`). Like the root README notes, this is a local-first demo with **no authentication or per-user authorization**.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/routing/generate` | Generate route candidates from `UserPreferences` JSON (`activity`, `routeType`, optional distance/duration targets, `startPoint` / `endPoint`, preference weights). Returns `{ "routes": [...] }`. Persists a generated batch when the result list is non-empty. Invalid start/end coordinates → `400`. |
| `GET` | `/api/saved-routes` | List all saved route JSON payloads. |
| `POST` | `/api/saved-routes` | Upsert a saved route from a JSON body; returns the stored payload. |
| `GET` | `/api/saved-routes/{id}` | Fetch one saved route by id. Missing → `404` (empty body). |
| `GET` | `/api/saved-routes/{id}/export.gpx` | Download the route as GPX (see below). |
| `POST` | `/api/generated-route-batches` | Persist a batch: body `{ "preferences": <object>, "routes": [<object>, ...] }` (`preferences` required, `routes` non-empty). Returns `{ "batchId": "<uuid>", "routeCount": <n> }`. |
| `GET` | `/api/osm-graph-cache?bbox=` | Return a fresh cached OSM graph for the bbox. Missing/expired → `404`. Response: `{ "bbox", "elements", "expiresAt" }`. |
| `PUT` | `/api/osm-graph-cache` | Put/refresh a cache entry: `{ "bbox", "elements", "ttlSeconds?" }` (`ttlSeconds` optional, default `600`, range 60–86400). Returns the same shape as GET. |
| `GET` | `/api/geocode/search?q=` | Address search. Success: `{ "results": [{ "label", "point", "category" }, ...], "message": null }`. Upstream failure: `502` with empty `results` and a `message`. |
| `GET` | `/api/strava/segments` | Explore segments near a point. Query: `lat`, `lng`, `activity` (`all` \| `running` \| `riding`), `radiusKm` (0.1–20), optional `limit` (1–50, default 10). Returns `{ "source", "segments", ... }` (`source` is `strava-api` or `mock`). |

Saved routes can be downloaded as GPX 1.1 for Garmin and other sports devices with `GET /api/saved-routes/{id}/export.gpx`. A matching route returns `200` with `Content-Type: application/gpx+xml` and `Content-Disposition: attachment; filename="{id}.gpx"`; missing routes return `404`, and payloads whose `geometry` is missing, not an array, or shorter than two points return `400`.

## Errors

Unhandled domain and validation failures are shaped by `ApiExceptionHandler` as JSON:

```json
{ "message": "..." }
```

| Status | When |
| --- | --- |
| `400` | `IllegalArgumentException` (message from the exception), or invalid / unreadable request body (`"Invalid request body."`) via `MethodArgumentNotValidException` / `HttpMessageNotReadableException`. |
| `404` | Resource missing (saved route, GPX export, OSM cache miss) — typically an empty body, not the message envelope. |
| `502` | Geocode upstream failure — body uses the geocode response shape with a `message` field, not only `{ "message" }`. |

`RoutingController` also maps its own `IllegalArgumentException` to the same `{ "message": "..." }` `400` body.
