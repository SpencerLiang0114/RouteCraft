CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE saved_routes (
    id text PRIMARY KEY,
    source text NOT NULL,
    name text NOT NULL,
    activity text NOT NULL,
    route_type text,
    distance_km numeric(10, 3) NOT NULL,
    estimated_duration_min integer NOT NULL,
    elevation_gain_m numeric(10, 1) NOT NULL,
    geometry geometry(LineString, 4326) NOT NULL,
    payload jsonb NOT NULL,
    saved_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX saved_routes_geometry_gix ON saved_routes USING gist (geometry);
CREATE INDEX saved_routes_saved_at_idx ON saved_routes (saved_at DESC);

CREATE TABLE osm_graph_cache (
    bbox_key text PRIMARY KEY,
    bbox geometry(Polygon, 4326) NOT NULL,
    elements jsonb NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX osm_graph_cache_bbox_gix ON osm_graph_cache USING gist (bbox);
CREATE INDEX osm_graph_cache_expires_at_idx ON osm_graph_cache (expires_at);

CREATE TABLE generated_route_batches (
    id uuid PRIMARY KEY,
    preferences jsonb NOT NULL,
    route_count integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE generated_route_candidates (
    id bigserial PRIMARY KEY,
    batch_id uuid NOT NULL REFERENCES generated_route_batches(id) ON DELETE CASCADE,
    route_id text NOT NULL,
    source text NOT NULL,
    name text NOT NULL,
    activity text NOT NULL,
    route_type text,
    distance_km numeric(10, 3) NOT NULL,
    estimated_duration_min integer NOT NULL,
    elevation_gain_m numeric(10, 1) NOT NULL,
    geometry geometry(LineString, 4326) NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (batch_id, route_id)
);

CREATE INDEX generated_route_candidates_batch_idx ON generated_route_candidates (batch_id);
CREATE INDEX generated_route_candidates_geometry_gix ON generated_route_candidates USING gist (geometry);
