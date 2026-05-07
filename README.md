# RouteCraft

RouteCraft is an outdoor route planner for running, hiking, and cycling. Users can browse mock Strava segments, pick or upload AllTrails-style GPX/KML routes, or generate new route candidates through a no-typing guided wizard that queries real OpenStreetMap data.

## User Flow

**Landing (`/`) → `/route-source` → `/strava` | `/alltrails` | `/wizard` → `/results` → `/saved`**

## Tech Stack

- Next.js 16 App Router
- TypeScript
- Tailwind CSS v4
- Zustand (route flow state, persisted to localStorage)
- Leaflet (map rendering)

## Run Locally

```bash
cp .env.example .env.local   # add Strava credentials to enable real Strava data
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Features

- Route source selection: Strava, AllTrails, or generated wizard
- Mock Strava segment picker and real Strava API integration (when credentials provided)
- GPX/KML file upload and parsing
- Guided wizard: activity, distance, start point, preferences
- Real OSM graph loaded from Overpass API; elevation from Open-Meteo / Open-Elevation fallback
- Loop, out-and-back, and point-to-point route generation
- Interactive Leaflet map with route highlighting and elevation profile
- Route export: GPX, KML, Google Maps URL
- Saved routes stored in localStorage

## Frontend / Backend Boundary

| Layer | Location | Rule |
|---|---|---|
| UI components | `src/components/` | Client only |
| Browser API clients | `src/frontend/api/` | `import "client-only"` — calls `src/app/api/` via fetch |
| Route handlers | `src/app/api/` | Next.js route handlers — bridge to backend |
| Backend logic | `src/backend/` | `import "server-only"` — never imported by components |

## Route Generation Pipeline

`POST /api/routing/generate` → `generateRoutes()` in `src/backend/routing/routeGenerator.ts`:

1. **Graph loading** — `loadOsmGraphNear()` fetches highway and green-space data from Overpass and elevation from Open-Meteo. Falls back to `loadMockGraphNear()` on failure.
2. **Path finding** — candidates are found with A\* and Yen's K-shortest paths (see below).
3. **Route type dispatch** — `loopGenerator`, `outAndBackGenerator`, `pointToPointGenerator` each use the graph differently.
4. **Candidate selection** — `candidateGenerator.ts` ranks candidates; `routeDiversity.ts` filters for geometric diversity; top 3 routes are returned labeled Recommended, Lowest Elevation, and Exploration.

## Pathfinding Algorithm

### A\* (`findShortestPath`)

The core path finder is A\* with a binary min-heap priority queue. For each edge it calls `computeEdgeCost()` (see Scoring below) to get a preference-weighted cost. The heuristic is straight-line distance × 0.2 — always admissible because `computeEdgeCost` floors at `distance × 0.2`, so A\* is optimal.

```
priority = costSoFar[node] + computeEdgeCost(edge) × (1 + edgePenalty)
         + distanceM(node, goal) × 0.2
```

The optional `edgePenalties` map lets callers inflate the cost of specific edges without blocking them entirely. The out-and-back generator uses this: after finding the outbound leg it re-runs A\* back with a 45% penalty (`× 1.55`) on every outbound edge, producing a near-parallel return path.

### Yen's K-Shortest Paths (`findKShortestPaths`)

Loop and point-to-point routes need multiple geometrically distinct options. Yen's algorithm builds on A\*:

1. Find the cheapest path with A\*.
2. For each subsequent path, iterate over every "spur node" in the previous best path. Block the edges already used by accepted paths sharing the same root, then run A\* from the spur node to the goal. Prepend the shared root to form a new candidate.
3. Collect all candidates in a min-heap sorted by cost, accept the cheapest unique one, repeat up to K times.

Up to 6 path candidates are generated per route type; `routeDiversity.ts` then filters them for geometric spread.

## Scoring Algorithm

Scoring operates in two places: **edge cost** (used during path finding to steer the route) and **route score** (used after generation to rank and display candidates).

### Edge Cost (`src/lib/routing/edgeCost.ts`)

Each edge's traversal cost starts at its physical distance in meters, then is adjusted by the user's preferences:

**Elevation**
- `climbing` style: rewards elevation gain (subtracts up to `elevationPreference × gain × 1.6`); adds penalty for very steep slopes (>12% grade).
- `easy_flat` style: penalizes any gain or slope.
- All other styles: penalize gain and slope weighted by `elevationPreference`.

**Route style bonuses** (subtract from cost → make segment more attractive)
| Style | Bonus |
|---|---|
| `park_heavy` | `−parkScore × distance × 0.28` |
| `shaded` | `−shadeScore × distance × 0.35` |
| `scenic` | `−sceneryScore × distance × 0.28` |
| `exploration` | `−noveltyScore × distance × 0.28` |

**Global preference penalties** (always applied on top of style)
- Safety: `+safetyPreference × (1 − safetyScore) × distance × 1.15`
- Shade: `+shadePreference × (1 − shadeScore) × distance × 0.42`
- Park: `−parkPreference × parkScore × distance × 0.32`
- Exploration: `−explorationPreference × noveltyScore × distance × 0.24`
- Scenery baseline: `−sceneryScore × distance × 0.08` (always)

**Time-of-day adjustments**
- Afternoon: extra shade penalty (`× 0.28`)
- Night: extra safety penalty (`× 0.35`) plus traffic exposure penalty (`× 0.18`)

**Activity adjustments**
- Cycling: rewards bike-friendly edges (`−bikeScore × 0.32`), penalizes non-bike edges (`+(1−bikeScore) × 0.48`), heavily penalizes steep grades (>8%).
- Walking/running/hiking: rewards walkable edges similarly; hiking also rewards trail/park_path road types and penalizes arterials.

**Road and surface type** — fixed additive bonuses/penalties per `roadType` and `surfaceType`. Highways are penalized most (+1.9 × distance); bike paths and greenways are rewarded most (−0.24 × distance).

**Floor** — `max(cost, distance × 0.2)` prevents cost from going negative.

### Route Score (`src/lib/routing/routeScoring.ts`)

After a route is built, it receives a 0–100 score used for ranking and display. The score is a weighted sum of seven route-level metrics:

| Metric | Base weight | Boosted by |
|---|---|---|
| `distanceScore` | 0.20 | — |
| `elevationScore` | 0.20 | `elevationPreference` (+0.04) |
| `parkScore` | 0.15 | `parkPreference` (+0.05) |
| `shadeScore` | 0.15 | `shadePreference` (+0.05) |
| `safetyScore` | 0.15 | `safetyPreference` (+0.06) |
| `explorationScore` | 0.10 | `explorationPreference` (+0.05) |
| `sceneryScore` | 0.05 | — |

Activity adjustments override the base weights before user preferences are applied:

| Activity | Notable change |
|---|---|
| Running | Safety ↑ 0.20, distance ↑ 0.23, elevation ↓ 0.15 |
| Hiking | Scenery ↑ 0.16, exploration ↑ 0.12, distance ↓ 0.13 |
| Cycling | Safety ↑ 0.28 (highest of any activity), park/shade ↓ |

All weights are re-normalized to sum to 1 before computing the final score.

Each route-level metric is itself a distance-weighted average of per-edge scores derived from OSM tags (road type, surface, proximity to green features) and Open-Meteo elevation data.
