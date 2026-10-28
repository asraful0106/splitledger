-- Up Migration
CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  user_id uuid,
  event text NOT NULL,
  metadata jsonb,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_user_created_idx ON audit_log (user_id, created_at);

-- Down Migration
DROP TABLE IF EXISTS audit_log;
