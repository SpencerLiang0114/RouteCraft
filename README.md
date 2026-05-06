# RouteCraft

RouteCraft is an MVP outdoor route planner for running, hiking, and cycling. It lets users choose mock Strava routes, choose or upload AllTrails-style GPX/KML routes, or generate new route candidates through a no-typing guided wizard.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- React components
- Zustand for route-flow state
- localStorage for MVP saved routes

## Frontend and Backend Boundary

- Frontend UI lives in `src/components` and uses small browser-only clients in `src/frontend/api`.
- Backend integrations and route generation live in `src/backend` and are called only from Next.js route handlers in `src/app/api`.
- Per-user route results and saved routes stay in each browser's local storage for the MVP, so one visitor's route flow is not stored in shared server memory.
- The backend is stateless across route-generation requests. Shared Strava data is cached only as bounded, short-lived API response cache to reduce upstream calls without storing user route selections.

## Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## MVP Features

- Route source selection for Strava, AllTrails, or generated routes
- Mock Strava and AllTrails route pickers
- GPX/KML upload parsing
- Guided no-typing route wizard
- Shared route analysis and scoring model
- Placeholder map with selected route highlighting
- Google Maps directions URL export
- GPX and KML downloads
- Saved routes stored in localStorage

## Future Hooks

The code includes TODO boundaries for Strava OAuth/import, richer AllTrails file import, real routing APIs, elevation APIs, OpenStreetMap/Overpass analysis, solar-position shade modeling, weather-aware suggestions, route history, recommendations, device export, navigation, and rerouting.
