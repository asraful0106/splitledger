-- Up Migration
CREATE TABLE parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  percentage_bp integer NOT NULL CHECK (percentage_bp >= 0 AND percentage_bp <= 10000),
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX parts_account_idx ON parts (account_id);
CREATE UNIQUE INDEX parts_account_active_name_idx ON parts (account_id, name) WHERE archived_at IS NULL;

-- Down Migration
DROP TABLE IF EXISTS parts;
