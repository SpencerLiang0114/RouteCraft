# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Layout

```
routecraft/
├── apps/web/                      # Next.js 16 frontend (UI, map, results)
├── services/routecraft-api/       # Spring Boot 4 / Java 21 backend (routing, persistence)
├── docker-compose.yml             # local Postgres + API stack
└── README.md
```

There are two runtimes:

- **Frontend** (`apps/web/`): Next.js App Router. UI, form input, Leaflet map, results display, saved-route management. Owns no business logic.
- **Backend** (`services/routecraft-api/`): Spring Boot. Owns route generation, OSM graph caching, persistence to PostGIS.

## Commands

```bash
# Frontend (run from apps/web/)
cd apps/web
npm install
npm run dev       # next dev → http://localhost:3000
npm run build     # production build (also type-checks)
npm run lint      # ESLint
npm run dev:api   # convenience: starts the Spring Boot API
npm run dev:db    # convenience: starts the Postgres container

# Backend (run from services/routecraft-api/)
cd services/routecraft-api
./mvnw test
./mvnw spring-boot:run
```

The default API URL is `http://localhost:18080`. Set `ROUTECRAFT_API_URL` (server-side) and `NEXT_PUBLIC_ROUTECRAFT_API_URL` (browser) in `apps/web/.env.local` to override.

## Frontend (`apps/web/`)

Path alias: `@/` maps to `apps/web/src/`. Use it for all imports — never relative paths across directory boundaries.

| Layer | Marker | Role |
|---|---|---|
| `src/app/` | server components | Pages and API route handlers |
| `src/components/` | client components | Maps, results, forms, controls |
| `src/frontend/api/` | `import "client-only"` | Browser fetch wrappers that call the Spring Boot API |
| `src/backend/` | `import "server-only"` | Server-side helpers (currently just the Strava proxy) |
| `src/lib/` | utilities | GPX/KML parsing/export, polyline decoding, scoring of *imported* routes |
| `src/store/routeStore.ts` | Zustand | Single persisted store for `results`, `activeRouteId`, `savedRoutes` (SSR-safe) |
| `src/types/route.ts` | types | Canonical types — `RouteCandidate`, `UserPreferences`, etc. |

Every page in `src/app/` is a thin server component that renders a corresponding `*Client.tsx` component from `src/components/`. All interactivity, state, and hooks live in the client component.

User flow: `/` → `/route-source` → `/strava` | `/wizard` | `/upload` → `/results` → `/saved`.

Maps are Leaflet, imported only in client components. The CSS import (`leaflet/dist/leaflet.css`) lives in `src/app/layout.tsx`.

Styling is Tailwind v4 via PostCSS. Design tokens: `--font-display` (Fraunces), `--font-body` (Nunito Sans). Background `#f7f5ee` on `<body>`.

## Backend (`services/routecraft-api/`)

Java packages under `com.routecraft.api`:

| Package | Role |
|---|---|
| `routing.model` | DTOs that mirror the TS shape exactly: `UserPreferences`, `RouteCandidate`, `LatLng`, enums |
| `routing.graph` | `RouteGraph`, KD-tree, A\*, Yen's K-shortest paths, `EdgeCost`, `GeoUtils` |
| `routing.osm` | `OverpassClient`, `ElevationService`, `OsmGraphLoader`, `OsmGraphBuilder`, `OsmTagging` |
| `routing.generator` | Loop / out-and-back / point-to-point generators, `CandidateSelector`, `RouteDiversity`, `MockGraph` |
| `routing` | `RouteGenerationService` orchestrator + `RoutingController` (`POST /api/routing/generate`) |
| `routes` | Saved-route + generated-batch repositories, `RoutePayloadReader`, `BoundingBox` |
| `osm` | OSM cache repository (`/api/osm-graph-cache`) |
| `config`, `common` | CORS + exception handling |

### Request flow for `POST /api/routing/generate`

1. `RoutingController` validates `UserPreferences` (required activity/routeType, finite coordinates).
2. `RouteGenerationService` loads the OSM graph near the start: in-memory cache → PostGIS cache (`osm_graph_cache`) → Overpass HTTP fetch (3-endpoint failover).
3. Trim to local radius, optionally enrich edges with Open-Meteo elevation (Open-Elevation as fallback).
4. Splice user start (and optional end) onto the nearest edges as anchor nodes.
5. Dispatch by route type to `LoopGenerator`, `OutAndBackGenerator`, or `PointToPointGenerator`.
6. Filter to within ±500 m of target distance, rank by total score, drop geometrically similar candidates, take top 3.
7. Persist the batch + candidates + envelope (`bbox geometry(Polygon, 4326)`) in PostGIS.
8. Return JSON `{ "routes": [...] }`.

If OSM loading fails entirely the service falls back to `MockGraph` (synthetic radial graph) so the wizard still produces something to display.

### Persistence

Flyway migrations under `src/main/resources/db/migration/`:

| Table | Stores |
|---|---|
| `saved_routes` | User-saved route payloads + PostGIS `LineString` |
| `generated_route_batches` | One row per generation call: preferences JSON, route count, bbox polygon |
| `generated_route_candidates` | Each generated candidate: payload + LineString |
| `osm_graph_cache` | Overpass element payloads keyed by bbox, with envelope and TTL |

### External APIs

- **Overpass** (`overpass-api.de`, plus two mirrors) — OSM highway and green-space data
- **Open-Meteo** (`api.open-meteo.com/v1/elevation`) — elevation, primary
- **Open-Elevation** (`api.open-elevation.com`) — elevation, fallback
- **Nominatim** — geocoding, proxied via `GET /api/geocode/search` in Next.js (still server-side)
- **Strava** — segment exploration proxied via `GET /api/strava/segments`; falls back to mocks in `src/backend/strava/stravaApi.ts` when credentials are absent

Strava credentials are optional. Add them to `apps/web/.env.local` to enable real Strava data.
