# RouteCraft

RouteCraft is an outdoor route planner for running, hiking, and cycling. Users can start from Strava data, upload a GPX/KML route file, or generate new route candidates with a guided wizard. Generation runs entirely on a Spring Boot service backed by OpenStreetMap and PostGIS.

## User Flow

`/` -> `/route-source` -> `/strava` | `/wizard` | `/upload` -> `/results` -> `/saved`

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

There is no root `package.json` and no npm workspaces — `cd apps/web` to run frontend commands, `cd services/routecraft-api` to run backend commands.

## Run Locally

```bash
cd apps/web
cp .env.example .env.local
npm install
npm run dev:db     # cd ../.. && docker compose up postgres
npm run dev:api    # cd ../../services/routecraft-api && ./mvnw spring-boot:run
npm run dev        # next dev on :3000
```

Open [http://localhost:3000](http://localhost:3000).

The Spring Boot API runs on [http://localhost:18080](http://localhost:18080). PostgreSQL/PostGIS runs on port `5432` with credentials from `docker-compose.yml`. Flyway applies `V1__routecraft_persistence.sql` and `V2__generated_route_batch_bbox.sql` on startup.

Strava credentials are optional. Add them to `apps/web/.env.local` to enable live segment loading; without them the Strava flow falls back to local mock data.

## Project Structure

| Layer | Location | Responsibility |
| --- | --- | --- |
| Pages | `apps/web/src/app/` | Next.js App Router pages |
| UI components | `apps/web/src/components/` | Route planning, results, maps, controls |
| Browser API clients | `apps/web/src/frontend/api/` | `client-only` fetch wrappers that call Spring Boot |
| Next remaining server code | `apps/web/src/backend/` | Strava OAuth/segment proxy. Routing logic has moved out of TypeScript |
| Geocoding/Strava proxies | `apps/web/src/app/api/geocode/`, `apps/web/src/app/api/strava/` | Thin proxies that hide third-party credentials |
| Spring Boot API | `services/routecraft-api/src/main/java/com/routecraft/api/` | Public route generation API, persistence, OSM cache |
| Shared frontend logic | `apps/web/src/lib/` | GPX/KML parsing, exporting, scoring/normalising imported routes |
| Flow state | `apps/web/src/store/` | Zustand store for transient route flow state |
| Domain types | `apps/web/src/types/` | Shared route, preference, and metric types |

The Java backend is organised by responsibility:

| Package | Role |
| --- | --- |
| `routing.model` | DTOs that mirror the TypeScript `RouteCandidate`/`UserPreferences` shape exactly |
| `routing.graph` | `RouteGraph`, KD-tree, A\*, Yen's K-shortest paths, edge cost |
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
4. Filter to within ±500 m of the user's target distance (relaxed when fewer than three survive).
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
  + EdgeCost.compute(edge) * (1 + edgePenalty)
  + distanceM(node, goal) * 0.2
```

`edgePenalty` lets each generator bias A\* away from specific edges without blocking them outright.

### Loop Generation

`LoopGenerator` picks waypoints around the start at radii calibrated to land near the target round-trip distance, then runs A\* through them with **cumulative edge penalties**: edges already used by earlier segments become expensive for later segments, so the return leg uses different roads. The closing segment receives an extra boost. A stack-based despike removes any go-in/come-back artefacts at waypoint transitions, and a self-overlap filter (≤12 % strict, ≤24 % loose) rejects lollipop loops.

### Out-and-Back

`OutAndBackGenerator` runs single-source Dijkstra (`Pathfinding.singleSourceShortestDistances`) from the start to every reachable node, filters destinations to within ±25 % of `target / 2`, and sorts by distance accuracy. The return leg retraces the outbound, making total distance deterministic (`2 × outbound`).

### Point-to-Point with Yen's K-Shortest Paths

`PointToPointGenerator` uses `Pathfinding.findKShortestPaths()` (Yen's) to surface alternatives between the user's start and end:

1. Find the cheapest path with A\*.
2. Iterate over spur nodes in accepted paths.
3. Temporarily block edges that would duplicate an accepted root path.
4. Run A\* from each spur node to the goal.
5. Accept the cheapest unique candidate until enough options are found.

For target-distance detours, an intermediate via-point is selected and the second leg is biased away from the first leg's edges so the two halves use different roads.

`RouteDiversity.filterDiverseRoutes()` then removes candidates that are too geometrically similar.

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
cd apps/web && npm run lint && npm run build
```

For an end-to-end smoke test, start Postgres and the API (`docker-compose up`), run `npm run dev`, walk the wizard, and confirm a row appears in `generated_route_batches` with non-null `bbox`.
