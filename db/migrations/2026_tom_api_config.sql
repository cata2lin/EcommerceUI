-- TOM API runtime configuration (single-row table).
-- Replaces dependence on TOM_* env vars by storing settings in DB.
-- SAFE: CREATE TABLE IF NOT EXISTS, no ALTER on any existing table.

BEGIN;

CREATE TABLE IF NOT EXISTS tom_api_config (
    id              SMALLINT PRIMARY KEY DEFAULT 1,
    base_url        TEXT,
    api_key_id      TEXT,
    api_secret      TEXT,
    source_code     TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT tom_api_config_singleton CHECK (id = 1)
);

-- Ensure a single row always exists so UPDATEs are simple.
INSERT INTO tom_api_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

COMMIT;
