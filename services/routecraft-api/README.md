# RouteCraft API

Saved routes can be downloaded as GPX 1.1 for Garmin and other sports devices with `GET /api/saved-routes/{id}/export.gpx`. A matching route returns `200` with `Content-Type: application/gpx+xml` and `Content-Disposition: attachment; filename="{id}.gpx"`; missing routes return `404`, and payloads whose `geometry` is missing, not an array, or shorter than two points return `400`.

Liveness can be checked with `GET /health` (returns `200 {"status":"UP"}` when the database answers `SELECT 1`, otherwise `503 {"status":"DOWN"}`) or Spring Actuator at `GET /actuator/health`. Neither endpoint probes the Rust routing engine.
