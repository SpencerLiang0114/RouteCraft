# Architecture Review

## What was found

**1. Duplicated `escapeXml` function**
Both `src/lib/gpxExport.ts` and `src/lib/kmlExport.ts` defined an identical 6-line XML escaping function. Any future change (e.g. adding a character escape) had to be made in two places.

**2. Domain logic buried in a data file**
`normalizeExternalRoute` — the function that converts any `ExternalRouteMock` into a `RouteCandidate` — lived inside `src/lib/mockRoutes.ts`. This made the file responsible for both holding static mock data and implementing core normalization logic. Components importing the normalizer had to pull in all mock data as a side effect.

**3. Hollow re-export type files**
`src/types/source.ts` and `src/types/preferences.ts` contained only re-export statements pointing back to `src/types/route.ts`. Nothing in the codebase imported from them. They added indirection without any benefit.

**4. Thin utility module with a single consumer**
`src/lib/storage.ts` (12 lines) exported `routecraftStorageKey` and `toSavedRoute`. Both were used exclusively by `src/store/routeStore.ts`. The module boundary added a file hop with no organizational benefit.

**5. Misleading variable name in mock data**
`mockRoutes.ts` declared `const boulder = { campus, creek, ridge, lake }` with coordinates at latitude ~42.4°N, longitude ~76.5°W — which is Ithaca, NY (Cornell's campus area), not Boulder, CO (~40.0°N). The incorrect name would mislead anyone reading or extending the mock data.

**6. Hardcoded shade text in `RouteSummary`**
`RouteSummary.tsx` always appended `"avoid strong sun"` to the summary sentence, regardless of the user's actual `shadePreference` setting. A user who selected low shade preference would see this text incorrectly.

## What was changed

| Change | Files affected |
|---|---|
| Extracted `escapeXml` to `src/lib/xmlUtils.ts` | `gpxExport.ts`, `kmlExport.ts` |
| Moved `normalizeExternalRoute` to `src/lib/routeNormalizer.ts` | `mockRoutes.ts`, `StravaRoutePicker.tsx`, `AllTrailsRoutePicker.tsx` |
| Deleted hollow re-export files | `src/types/source.ts`, `src/types/preferences.ts` |
| Inlined `storage.ts` into `routeStore.ts` | `routeStore.ts`, `storage.ts` (deleted) |
| Renamed `boulder` → `ithaca` in mock data | `mockRoutes.ts` |
| Made `RouteSummary` shade note preference-aware | `RouteSummary.tsx` |
| Updated `CLAUDE.md` to reflect current structure | `CLAUDE.md` |

All changes pass `npm run build` (TypeScript compilation + Next.js optimization) and `npm run lint` with no errors or warnings.

## Why the new structure is better

- **`routeNormalizer.ts`** has a single clear responsibility. Mock data files can be updated without touching normalization logic, and vice versa. Future real adapters (Strava OAuth, AllTrails API) can be added next to `routeNormalizer.ts` without touching mock data.
- **`xmlUtils.ts`** is the canonical location for XML serialization helpers. Adding elevation to GPX output, for example, is now a one-place change.
- **Removing the re-export shims** means `src/types/route.ts` is unambiguously the single source of truth for all route types. There is no question of which file to import from.
- **Inlining `storage`** into the store removes a file boundary that carried no architectural meaning. The store is self-contained.
- **Correct `ithaca` naming** makes the mock data honest about where the coordinates are. Anyone extending the mock set (e.g. adding Boulder, CO routes) won't be confused.
- **Preference-aware shade note** makes the wizard review step accurate.

## Assumptions made

- The two parallel `routeAnalyzer.ts` / `routeScoring.ts` / `geoUtils.ts` pairs (`src/lib/` and `src/lib/routing/`) were intentionally kept separate. The top-level files handle external/uploaded routes using `RouteAnalysisSignals`; the routing sub-tree files handle generated routes using full edge-level data. Merging them would require a common interface that doesn't cleanly exist yet.
- `src/lib/polyline.ts` stays at top-level. It is used only by `stravaApi.ts` but is a pure utility with no backend dependency markers, so placing it under `src/backend/` would be wrong and under `src/lib/` is correct.
- The `AllTrailsUpload` component name was kept. It is in the AllTrails page context and handles AllTrails-style file exports. If the upload feature is promoted to a generic route import surface, it should be renamed then.

## Remaining areas for future improvement

- **`StravaRoutePicker.tsx` is ~600 lines.** It combines map initialization, geolocation, Strava API calls, search/filter state, and a route list. Splitting the Leaflet map into a `StravaMap` sub-component and the route list into a `StravaRouteList` sub-component would improve readability without requiring any state lifting.
- **Two scoring systems.** `src/lib/routeScoring.ts` uses fixed activity-weight tables. `src/lib/routing/routeScoring.ts` uses preference-adjusted weights. Unifying them would allow imported routes to benefit from the same preference-tuned scoring that generated routes receive.
- **Geometry utilities are duplicated across OSM graph, Strava route handler, and lib.** Point-to-segment distance is implemented three times (`osmGraph.ts`, `api/strava/segments/route.ts`, and conceptually in `geoUtils.ts`). These could be consolidated in `src/lib/geoUtils.ts` if the route handler is refactored to call a backend utility instead.
- **No automated tests.** The routing algorithm, scoring functions, and file parsers are pure functions that are good candidates for unit tests. The build currently catches only type errors.
