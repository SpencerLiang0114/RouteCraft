# RouteCraft

RouteCraft is an MVP outdoor route planner for running, hiking, and cycling. It lets users choose mock Strava routes, choose or upload AllTrails-style GPX/KML routes, or generate new route candidates through a no-typing guided wizard.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- React components
- Zustand for route-flow state
- localStorage for MVP saved routes

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
