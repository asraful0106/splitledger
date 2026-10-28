-- Up Migration
CREATE TABLE transaction_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  part_id uuid NOT NULL REFERENCES parts(id),
  amount_minor bigint NOT NULL,
  percentage_bp_snapshot integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX transaction_entries_transaction_idx ON transaction_entries (transaction_id);
CREATE INDEX transaction_entries_part_idx ON transaction_entries (part_id);

CREATE FUNCTION check_transaction_entries_balance() RETURNS trigger AS $$
DECLARE
  entries_total bigint;
  tx_amount bigint;
  tx_type text;
BEGIN
  SELECT COALESCE(SUM(amount_minor), 0) INTO entries_total
  FROM transaction_entries WHERE transaction_id = NEW.transaction_id;

  SELECT amount_minor, type INTO tx_amount, tx_type
  FROM transactions WHERE id = NEW.transaction_id;

  IF tx_type = 'deposit' THEN
    IF entries_total <> tx_amount THEN
      RAISE EXCEPTION 'transaction % entries total % does not equal deposit amount %',
        NEW.transaction_id, entries_total, tx_amount;
    END IF;
  ELSE
    IF entries_total <> -tx_amount THEN
      RAISE EXCEPTION 'transaction % entries total % does not equal negative withdrawal amount %',
        NEW.transaction_id, entries_total, tx_amount;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER transaction_entries_balance_trigger
  AFTER INSERT ON transaction_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION check_transaction_entries_balance();

-- Down Migration
DROP TRIGGER IF EXISTS transaction_entries_balance_trigger ON transaction_entries;
DROP FUNCTION IF EXISTS check_transaction_entries_balance();
DROP TABLE IF EXISTS transaction_entries;
