-- F5 + F20: Enforce single-writer contract for finance_transactions on rows that originate
-- from a booking_payments row.
--
-- BEFORE deploying this migration, run scripts/verify-finance-ledger-no-duplicates.sql
-- in production. If any duplicates exist, resolve them manually first; the unique index
-- will refuse to CREATE otherwise.

CREATE UNIQUE INDEX IF NOT EXISTS ux_finance_transactions_source_payment_per_type
  ON public.finance_transactions (source_payment_id, transaction_type)
  WHERE source_payment_id IS NOT NULL;

-- Document the contract at the schema level.
COMMENT ON INDEX public.ux_finance_transactions_source_payment_per_type IS
  'Single-writer contract: the create_finance_ledger_from_payment trigger is the sole writer '
  'of finance_transactions rows tied to a booking_payments row. Application code must never '
  'insert finance_transactions with source_payment_id set — only the wallet/gift-card-only '
  'fallback path (no booking_payments row) is permitted to write app-side.';
