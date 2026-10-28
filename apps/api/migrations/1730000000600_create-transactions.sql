-- Up Migration
CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('deposit', 'withdrawal')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  mode text NOT NULL CHECK (mode IN ('split', 'single_part', 'manual')),
  warning_acknowledged_at timestamptz,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  note text,
  category text,
  idempotency_key text,
  reverses_transaction_id uuid REFERENCES transactions(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX transactions_idempotency_idx
  ON transactions (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX transactions_reverses_idx
  ON transactions (reverses_transaction_id) WHERE reverses_transaction_id IS NOT NULL;

CREATE INDEX transactions_account_history_idx
  ON transactions (account_id, occurred_at DESC, id DESC);

-- Down Migration
DROP TABLE IF EXISTS transactions;
