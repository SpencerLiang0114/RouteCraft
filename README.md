# RouteCraft

RouteCraft is an outdoor route planner for running, hiking, and cycling. Users can start from Strava data, upload a GPX/KML route file, or generate new route candidates with a guided wizard backed by OpenStreetMap road and path data.

## User Flow

`/` -> `/route-source` -> `/strava` | `/wizard` | `/upload` -> `/results` -> `/saved`

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Zustand for persisted route flow state
- Leaflet for map rendering

## Run Locally

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Strava credentials are optional. Add them to `.env.local` to enable live Strava segment loading; without them, the Strava flow falls back to local mock route data.

## Features

- Route source selection for Strava, route generation, or GPX/KML upload
- Mock Strava route data with optional live Strava segment API integration
- GPX and KML parsing for uploaded route files
- Guided route wizard for activity, start point, goal, route style, preferences, and departure time
- OpenStreetMap graph loading from Overpass API
- Elevation enrichment from Open-Meteo with Open-Elevation fallback
- Loop, out-and-back, and point-to-point route generation
- Interactive Leaflet map with route highlighting and elevation profile
- Route export as GPX, KML, or Google Maps URL
- Saved routes persisted in localStorage

## Project Structure

| Layer | Location | Responsibility |
| --- | --- | --- |
| Pages and route handlers | `src/app/` | Next.js App Router pages and API endpoints |
| UI components | `src/components/` | Client-facing route planning, results, maps, and controls |
| Browser API clients | `src/frontend/api/` | `client-only` fetch wrappers for app API routes |
| Backend services | `src/backend/` | `server-only` route generation and Strava integration |
| Shared route logic | `src/lib/` | Parsing, exporting, analysis, scoring, and routing utilities |
| Flow state | `src/store/` | Zustand store persisted to browser localStorage |
| Domain types | `src/types/` | Shared route, preference, and metric types |

## Route Generation Pipeline

`POST /api/routing/generate` calls `generateRoutes()` in `src/backend/routing/routeGenerator.ts`.

1. Load a route graph near the selected start point with `loadOsmGraphNear()`.
2. Fetch road/path geometry from Overpass and elevation data from Open-Meteo.
3. Dispatch to the loop, out-and-back, or point-to-point generator.
4. Filter candidates to within ±500 m of the user's target distance (relaxed if fewer than three survive).
5. Filter for geometric diversity.
6. Return the top three candidates ranked by total score (highest first).

If RouteCraft cannot load enough mapped road/path data near the selected point, generation fails with a clear error instead of returning synthetic geometry.

## Routing Algorithms

### A*

`findShortestPath()` uses A* with a binary min-heap priority queue. Each edge is scored by `computeEdgeCost()`, which blends distance, route style, activity, elevation, time of day, and user preference weights.

The heuristic is straight-line distance multiplied by `0.2`. `computeEdgeCost()` floors every edge at `distance * 0.2`, which keeps the heuristic admissible.

```text
priority = costSoFar[node]
  + computeEdgeCost(edge) * (1 + edgePenalty)
  + distanceM(node, goal) * 0.2
```

`edgePenalty` lets each generator bias A* away from specific edges without blocking them outright.

### Loop Generation

Picks waypoints around the start at radii calibrated to land near the target round-trip distance, then runs A* through them with **cumulative edge penalties**: edges already used by earlier segments become expensive for later segments, so the return leg uses different roads. The closing segment to the start node gets an additional penalty boost. A stack-based despike removes any go-in/come-back artifacts at waypoint transitions, and a self-overlap filter (≤15 % strict, ≤35 % loose) rejects lollipop loops.

### Out-and-Back Generation

Single-source Dijkstra from the start point computes actual road distances to every reachable node. Destinations are filtered to within ±25 % of `target / 2` and sorted by distance accuracy. The return leg always retraces the outbound exactly, so total distance is deterministic (`2 × outbound`).

### Point-to-Point with Yen's K-Shortest Paths

Yen's algorithm produces multiple alternatives between the user's start and end:

1. Find the cheapest path with A*.
2. Iterate over spur nodes in accepted paths.
3. Temporarily block edges that would duplicate an accepted root path.
4. Run A* from each spur node to the goal.
5. Accept the cheapest unique candidate until enough options are found.

For target-distance detours, an intermediate via-point is selected and the second leg is biased away from the first leg's edges so the two halves use different roads.

`routeDiversity.ts` then removes candidates that are too geometrically similar.

## Scoring

RouteCraft scores routes in two stages.

### Edge Cost

`src/lib/routing/edgeCost.ts` controls path finding. It starts with physical distance, then adjusts cost with:

- Elevation profile and slope
- Route style bonuses for parks, shade, scenery, climbing, or exploration
- Safety, shade, park, exploration, and scenery preferences
- Time-of-day penalties for afternoon shade needs and night safety concerns
- Activity-specific behavior for running, hiking, and cycling
- Road and surface type bonuses or penalties

The final edge cost is floored at `distance * 0.2` so preference bonuses cannot make traversal cost negative.

### Route Score

`src/lib/routing/routeScoring.ts` ranks finished routes on a 0-100 scale. The score combines:

- Distance match
- Elevation fit
- Park access
- Shade cover
- Safety
- Exploration value
- Scenery

Activity type and user preferences adjust the weights before the final score is calculated.
