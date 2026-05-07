ALTER TABLE generated_route_batches
    ADD COLUMN bbox geometry(Polygon, 4326);

CREATE INDEX IF NOT EXISTS generated_route_batches_bbox_gix
    ON generated_route_batches USING gist (bbox);
