-- Up Migration
ALTER TABLE parts
  ADD COLUMN low_balance_threshold_minor bigint;

ALTER TABLE parts
  ADD CONSTRAINT parts_low_balance_threshold_check
  CHECK (low_balance_threshold_minor IS NULL OR low_balance_threshold_minor >= 0);

-- Down Migration
ALTER TABLE parts DROP CONSTRAINT IF EXISTS parts_low_balance_threshold_check;
ALTER TABLE parts DROP COLUMN IF EXISTS low_balance_threshold_minor;
