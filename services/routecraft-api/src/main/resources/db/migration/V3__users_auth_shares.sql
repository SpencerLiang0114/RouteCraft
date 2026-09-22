CREATE TABLE users (
    id uuid PRIMARY KEY,
    email text NOT NULL,
    password_hash text NOT NULL,
    display_name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE TABLE user_strava_tokens (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    expires_at timestamptz NOT NULL,
    athlete_id bigint,
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE saved_routes
    ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    ADD COLUMN notes text,
    ADD COLUMN tags text[] NOT NULL DEFAULT '{}',
    ADD COLUMN folder text,
    ADD COLUMN visibility text NOT NULL DEFAULT 'private';

ALTER TABLE saved_routes
    ADD CONSTRAINT saved_routes_visibility_check
        CHECK (visibility IN ('private', 'public'));

CREATE INDEX saved_routes_user_id_idx ON saved_routes (user_id);
CREATE INDEX saved_routes_user_saved_at_idx ON saved_routes (user_id, saved_at DESC);
CREATE INDEX saved_routes_tags_gin ON saved_routes USING gin (tags);

ALTER TABLE generated_route_batches
    ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX generated_route_batches_user_id_idx ON generated_route_batches (user_id);

CREATE TABLE route_shares (
    id uuid PRIMARY KEY,
    token text NOT NULL,
    route_id text NOT NULL REFERENCES saved_routes(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT route_shares_token_unique UNIQUE (token)
);

CREATE INDEX route_shares_route_id_idx ON route_shares (route_id);
CREATE INDEX route_shares_expires_at_idx ON route_shares (expires_at);
