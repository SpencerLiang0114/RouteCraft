# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # start dev server at http://localhost:3000
npm run build    # production build (also type-checks)
npm run lint     # ESLint
```

There are no automated tests. Type correctness is verified through `npm run build`.

## Architecture

RouteCraft is a Next.js 16 App Router application. The primary user flow is:

**Landing (`/`) → `/route-source` → `/strava` | `/alltrails` | `/wizard` → `/results` → `/saved`**

### Path alias

`@/` maps to `src/`. Use it for all imports — never use relative paths across directory boundaries.

### Page component pattern

Every page in `src/app/` is a thin server component that just renders a corresponding `*Client.tsx` component from `src/components/`. All interactivity, state, and hooks live in the client component.

### Strict client/server boundary

Three categories of code enforce the boundary:

| Layer | Marker | Role |
|---|---|---|
| `src/backend/` | `import "server-only"` | Backend logic — only callable from `src/app/api/` route handlers |
| `src/app/api/` | Next.js route handlers | Bridge between browser and backend |
| `src/frontend/api/` | `import "client-only"` | Browser `fetch()` wrappers that call `src/app/api/` |

Never import `src/backend/` from components or `src/frontend/`. Never import `src/frontend/` from route handlers or backend.

### Global state

`src/store/routeStore.ts` — a single Zustand store persisted to `localStorage`. Holds `results: RouteCandidate[]`, `activeRouteId`, and `savedRoutes`. The store is SSR-safe via a noop storage fallback for server renders.

`src/types/route.ts` is the canonical type file. Import from it directly — do not add re-export shim files under `src/types/`.

### Route generation pipeline

`POST /api/routing/generate` → `generateRoutes()` in `src/backend/routing/routeGenerator.ts`:

1. **Graph loading** — `loadOsmGraphNear()` fetches real street/trail data from the Overpass API (OSM) and elevation from Open-Meteo (fallback: Open-Elevation). On failure, falls back to `loadMockGraphNear()`.
2. **Path finding** — A\* (`findShortestPath`) and Yen's K-Shortest Paths (`findKShortestPaths`) are implemented in `src/lib/routing/graph.ts`. Edge costs are computed by `src/lib/routing/edgeCost.ts` using the user's park/shade/safety/elevation/exploration preferences.
3. **Route type dispatch** — `loopGenerator`, `outAndBackGenerator`, `pointToPointGenerator` each use the graph differently. All live in `src/lib/routing/`.
4. **Candidate selection** — `candidateGenerator.ts` ranks candidates; `routeDiversity.ts` filters for geometric diversity; top 3 routes are returned.

Each `RouteEdge` carries per-segment scores (parkScore, shadeScore, safetyScore, sceneryScore, bikeScore, walkScore, noveltyScore) derived from OSM tags and proximity to green features. These feed the scoring and the A\* cost function.

### Key `src/lib/` files

| File | Role |
|---|---|
| `routeAnalyzer.ts` | Normalizes external/uploaded routes (with `RouteAnalysisSignals`) into `RouteCandidate` |
| `routeNormalizer.ts` | `normalizeExternalRoute` adapter — converts `ExternalRouteMock` → `RouteCandidate` |
| `routeScoring.ts` | Simple activity-weighted total score for external routes |
| `mockRoutes.ts` | Mock `ExternalRouteMock` data for Strava and AllTrails. Coordinates are Ithaca, NY |
| `geoUtils.ts` | Haversine distance, duration estimates, display formatters (`formatActivity`, `formatSource`) |
| `xmlUtils.ts` | Shared `escapeXml` used by GPX and KML exporters |
| `gpxParser.ts` / `kmlParser.ts` | Parse uploaded files into `RouteCandidate` via `analyzeRoute` |
| `gpxExport.ts` / `kmlExport.ts` / `googleMapsExport.ts` | Export utilities |
| `polyline.ts` | Google encoded polyline decoder — used by `stravaApi.ts` |
| `routing/` | Contains the OSM graph loader, A\*, K-shortest paths, route type generators, edge cost, and scoring for generated routes |

The `src/lib/routing/` sub-tree has its own `routeAnalyzer.ts`, `routeScoring.ts`, and `geoUtils.ts` that are specific to the generated-route pipeline. These are intentionally separate from the top-level `src/lib/` counterparts which handle external/uploaded routes.

### External APIs

- **Overpass API** (`overpass-api.de`) — OSM highway and green-space data
- **Open-Meteo** (`api.open-meteo.com/v1/elevation`) — elevation, primary
- **Open-Elevation** (`api.open-elevation.com`) — elevation, fallback
- **Nominatim** — geocoding, proxied via `GET /api/geocode/search`
- **Strava** — segment exploration proxied via `GET /api/strava/segments`; attempts the real API using credentials from `.env.local`, falls back to mocks in `src/backend/strava/stravaApi.ts` when credentials are absent

Copy `.env.example` to `.env.local` and supply Strava OAuth credentials to enable real Strava data.

### Maps

Leaflet (`leaflet` npm package) renders all maps. It is imported only in client components. The CSS import (`leaflet/dist/leaflet.css`) lives in `src/app/layout.tsx`.

### Styling

Tailwind CSS v4 via PostCSS. Design tokens: `--font-display` (Fraunces) and `--font-body` (Nunito Sans). Background color `#f7f5ee` on `<body>`.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
