-- Beautonomi Database Migration
-- 299_payout_ledger_and_hold.sql
-- Add payout_id to finance_transactions for payout ledger entries (reconciliation + idempotency).
-- No schema change for hold period; that is in platform_settings.settings.payouts (app-level).

-- Allow finance_transactions to reference a payout when transaction_type = 'payout'
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS payout_id UUID REFERENCES payouts(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_transactions_payout_id
  ON finance_transactions(payout_id)
  WHERE payout_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_finance_transactions_payout_id_exists
  ON finance_transactions(payout_id)
  WHERE payout_id IS NOT NULL;

COMMENT ON COLUMN finance_transactions.payout_id IS 'Set when transaction_type = payout; one ledger row per completed payout for balance calculation.';
