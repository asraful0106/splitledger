-- Up Migration
CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  bank_name text NOT NULL,
  last4 text,
  currency text NOT NULL DEFAULT 'BDT',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounts_last4_check CHECK (last4 IS NULL OR last4 ~ '^[0-9]{4}$')
);

CREATE INDEX accounts_user_idx ON accounts (user_id);

-- Down Migration
DROP TABLE IF EXISTS accounts;
