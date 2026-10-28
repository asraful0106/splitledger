-- Up Migration
CREATE INDEX transactions_user_occurred_idx
  ON transactions (user_id, occurred_at DESC);

-- Down Migration
DROP INDEX IF EXISTS transactions_user_occurred_idx;
