-- Up Migration
ALTER TABLE accounts
  ADD CONSTRAINT accounts_currency_check
  CHECK (currency IN ('BDT', 'USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'SGD', 'AED', 'MYR'));

-- Down Migration
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_currency_check;
