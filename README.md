# RouteCraft

RouteCraft is an outdoor route planner for running, hiking, and cycling. Users can start from Strava data, upload a GPX/KML route file, or generate new route candidates with a guided wizard. Generation runs entirely on a Spring Boot service backed by OpenStreetMap and PostGIS.

## User Flow

`/` -> `/route-source` -> `/strava` | `/wizard` | `/upload` -> `/results` -> `/saved`

## Demo

![RouteCraft generated route demo](docs/assets/routecraft2.png)

## Architecture

| Tier | Stack | Responsibility |
| --- | --- | --- |
| Frontend | Next.js 16 App Router, React 19, Tailwind v4, Zustand, Leaflet | User input, map rendering, results display, saved-route list |
| Backend API | Spring Boot 4 on Java 21 | Request validation, route generation, persistence, OSM graph cache |
| Database | PostgreSQL 16 + PostGIS 3.4 | Saved routes, generated batches, route candidates with `LineString` geometry, OSM cache, batch bounding boxes |

The frontend never owns routing business logic. It collects preferences, hits the Spring Boot API, and renders the resulting candidates on a map.

```
User → Next.js (form) → Spring Boot /api/routing/generate
                          ↓
                          ├─→ load OSM graph (cache or Overpass)
                          ├─→ enrich with elevation (Open-Meteo)
                          ├─→ run loop / out-and-back / point-to-point generator
                          ├─→ rank, diversify, pick top 3
                          ├─→ persist batch + candidates + bbox in PostGIS
                          ↓
Routes → Next.js (Leaflet) → User
```

## Repository layout

```
routecraft/
├── apps/web/                  # Next.js 16 frontend
├── services/routecraft-api/   # Spring Boot 4 / Java 21 backend
├── docker-compose.yml         # local Postgres + API stack
└── README.md
```

There is no root `package.json` and no root package-manager workspace — `cd apps/web` to run frontend pnpm commands, `cd services/routecraft-api` to run backend commands.

## Run Locally

RouteCraft is currently a local-first demo. The backend endpoints do not include
authentication or per-user authorization, so do not expose `routecraft-api`
directly to the public internet without adding those controls.

Use three terminals:

```bash
# Terminal 1: database
docker compose up postgres
```

```bash
# Terminal 2: backend API
cd services/routecraft-api
./mvnw spring-boot:run
```

```bash
# Terminal 3: frontend
cd apps/web
cp .env.example .env.local
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

The Spring Boot API runs on [http://localhost:18080](http://localhost:18080). PostgreSQL/PostGIS runs on port `5432` with credentials from `docker-compose.yml`. Flyway applies `V1__routecraft_persistence.sql` and `V2__generated_route_batch_bbox.sql` on startup.

You can also run the database and API together from the repo root:

```bash
docker compose up --build
```

Then run the frontend separately from `apps/web` with `pnpm dev`.

Strava credentials are optional. Export `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_ACCESS_TOKEN`, and `STRAVA_REFRESH_TOKEN` in the backend environment to enable live segment loading; without them the Strava flow falls back to local mock data. The frontend `.env.local` only needs the API URL values from `.env.example`; backend-only values are documented in `services/routecraft-api/.env.example`.

## Project Structure

| Layer | Location | Responsibility |
| --- | --- | --- |
| Pages | `apps/web/src/app/` | Next.js App Router pages |
| UI components | `apps/web/src/components/` | Route planning, results, maps, controls |
| Browser API clients | `apps/web/src/lib/api-client/` | Fetch wrappers that call Spring Boot |
| Spring Boot API | `services/routecraft-api/src/main/java/com/routecraft/api/` | Public route generation API, persistence, OSM cache |
| Geocoding/Strava endpoints | `services/routecraft-api/src/main/java/com/routecraft/api/routing/osm/` | Backend endpoints that hide third-party credentials |
| Shared frontend logic | `apps/web/src/lib/` | GPX/KML parsing, exporting, scoring/normalising imported routes |
| Flow state | `apps/web/src/store/` | Zustand store for transient route flow state |
| Domain types | `apps/web/src/types/` | Shared route, preference, and metric types |

The Java backend is organised by responsibility:

| Package | Role |
| --- | --- |
| `routing.model` | DTOs that mirror the TypeScript `RouteCandidate`/`UserPreferences` shape exactly |
| `routing.graph` | `RouteGraph`, KD-tree, A\*, shortest-path trees, bounded alternatives, edge cost |
| `routing.osm` | Overpass HTTP client, Open-Meteo elevation, OSM-tag scoring, anchor splicing |
| `routing.generator` | Loop/out-and-back/point-to-point generators, candidate ranking, diversity filter, mock fallback graph |
| `routing` | `RouteGenerationService` (orchestrator) and `RoutingController` |
| `routes` | `GeneratedRouteBatchRepository`, `SavedRouteRepository`, payload helpers |
| `osm` | OSM graph cache repository (PostGIS `gist` index) |
| `config`, `common` | CORS, exception handling |

## Persistence

| Table | Stores |
| --- | --- |
| `saved_routes` | User-saved route payloads plus PostGIS `LineString` geometry |
| `generated_route_batches` | One row per `POST /api/routing/generate` call: preferences, route count, candidate-derived bbox |
| `generated_route_candidates` | Each generated candidate: route metadata, payload JSON, `LineString` geometry |
| `osm_graph_cache` | Overpass element payloads keyed by bbox, with PostGIS envelope and TTL |

The bounding box on `generated_route_batches` is computed from candidate geometries on insert and indexed (`gist`) for spatial filtering.

## Route Generation Pipeline

`POST /api/routing/generate` is handled by `RoutingController`. The flow:

1. Validate `UserPreferences` (activity, route type, finite start coordinates, optional end coordinates).
2. `RouteGenerationService.generate()` loads the OSM graph near the start (`OsmGraphLoader`).
   - Check the in-process cache → check the PostGIS cache (`osm_graph_cache`) → fetch from Overpass and write both caches.
   - Trim to the local radius (`graphRadiusKm` adapts to activity and target distance).
   - Optionally enrich edges with Open-Meteo elevations (Open-Elevation as fallback).
   - Splice user start (and end, if provided) onto the nearest edges.
3. Dispatch by route type to `LoopGenerator`, `OutAndBackGenerator`, or `PointToPointGenerator`.
4. Filter candidates using the target-distance tolerance (relaxed when fewer than three survive).
5. Rank by total score, then drop geometrically similar candidates with `RouteDiversity`.
6. Return the top three.
7. Persist the batch (with bbox) and per-candidate `LineString` geometry in PostGIS.

If OSM loading fails entirely, the service falls back to a synthetic graph (`MockGraph`) so the wizard still produces something to display.

## Routing Algorithms

### A\*

`Pathfinding.findShortestPath()` uses Java's `PriorityQueue` as a min-heap. Each edge is scored by `EdgeCost.compute()`, which blends distance, route style, activity, elevation, time of day, and user preference weights.

The heuristic is straight-line distance multiplied by `0.2`. `EdgeCost.compute()` floors every edge at `distance * 0.2`, so the heuristic stays admissible.

```text
priority = costSoFar[node]
  + EdgeCost.compute(edge)
  + edgePenalty
  + distanceM(node, goal) * 0.2
```

`edgePenalty` lets each generator bias A\* away from specific edges without blocking them outright.

### Loop Generation

`LoopGenerator` picks tiered waypoint sets around the start at radii calibrated to land near the target round-trip distance. It runs A\* through the strongest tiers first, caches repeated first legs and closing corridors, and expands to broader tiers only when the current pool lacks enough target-matching, diverse routes. **Cumulative edge penalties** make edges used by earlier segments expensive for later segments, so the return leg uses different roads. A stack-based despike removes go-in/come-back artefacts at waypoint transitions, and a self-overlap filter (≤5 % strict, ≤15 % loose) rejects lollipop loops.

### Out-and-Back

`OutAndBackGenerator` builds one preference-weighted shortest-path tree from the start, stores both optimized cost and physical path distance for every reachable node, then reconstructs the best outbound paths for destinations near `target / 2`. The return leg retraces the outbound, making total distance deterministic (`2 × outbound`) without rerunning A\* for every destination.

### Point-to-Point Alternatives

`PointToPointGenerator` uses a bounded edge-penalized search to surface practical alternatives between the user's start and end:

1. Find the cheapest path with A\*.
2. Add cumulative penalties to its edges.
3. Re-run A\* with the penalties so later paths prefer different corridors.
4. Keep unique alternatives within a fixed search budget.

For target-distance detours, a bounded heap keeps the best intermediate via-points, and the second leg is biased away from the first leg's edges so the two halves use different roads.

`RouteDiversity.filterDiverseRoutes()` then removes candidates that are too geometrically similar.

### Runtime-oriented search design

The generators avoid multiplying full-graph searches when a shared result can be reused. Shortest-path trees replace repeated destination searches, loop first legs and spatial corridors are cached, route fingerprints are prepared once for diversity checks, and candidate generation stops after the required target-distance/diversity pool is available. On a synthetic 10 km `MockGraph` benchmark, route-generation time improved by approximately 2× for loops, 3× for out-and-back routes, and 5× for point-to-point routes; the benchmark excludes OSM loading and elevation services.

## Scoring

### Edge Cost

`EdgeCost.compute()` controls path finding. It starts with physical distance, then adjusts cost with:

- Elevation profile and slope
- Route style bonuses for parks, shade, scenery, climbing, or exploration
- Safety, shade, park, exploration, and scenery preferences
- Time-of-day penalties for afternoon shade needs and night safety concerns
- Activity-specific behaviour for running, hiking, and cycling
- Road and surface type bonuses or penalties

The final edge cost is floored at `distance * 0.2`.

### Route Score

`RouteAnalyzer.analyzeRoute()` produces per-route metrics; `RouteScoring.scoreRoute()` collapses them to a 0-100 score using activity-aware weights, then user preferences shift the weights further. Components: distance match, elevation fit, park access, shade cover, safety, exploration value, scenery.

## Verification

```bash
# Backend
cd services/routecraft-api && ./mvnw test

# Frontend
cd apps/web && pnpm lint && pnpm build
```

For an end-to-end smoke test, start Postgres and the API (`docker-compose up`), run `pnpm dev`, walk the wizard, and confirm a row appears in `generated_route_batches` with non-null `bbox`.
