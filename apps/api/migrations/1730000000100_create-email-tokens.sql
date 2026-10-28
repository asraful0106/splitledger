-- Up Migration
CREATE TABLE email_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('verify', 'reset')),
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_tokens_token_hash_idx ON email_tokens (token_hash);
CREATE INDEX email_tokens_user_type_idx ON email_tokens (user_id, type);

-- Down Migration
DROP TABLE IF EXISTS email_tokens;
