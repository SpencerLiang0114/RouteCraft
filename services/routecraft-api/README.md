# RouteCraft API

Saved routes can be downloaded as GPX 1.1 for Garmin and other sports devices with `GET /api/saved-routes/{id}/export.gpx`. A matching route returns `200` with `Content-Type: application/gpx+xml` and `Content-Disposition: attachment; filename="{id}.gpx"`; missing routes return `404`, and payloads whose `geometry` is missing, not an array, or shorter than two points return `400`.
