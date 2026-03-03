-- Beautonomi Database Migration
-- 300_backfill_payout_ledger.sql
-- Backfill finance_transactions rows for completed payouts that never got a ledger entry.
-- Ensures getAvailablePayoutBalance() is correct for historical payouts.

INSERT INTO finance_transactions (
  provider_id,
  payout_id,
  transaction_type,
  amount,
  fees,
  commission,
  net,
  description,
  created_at
)
SELECT
  p.provider_id,
  p.id,
  'payout',
  COALESCE(p.net_amount, p.amount),
  0,
  0,
  COALESCE(p.net_amount, p.amount),
  'Payout ' || COALESCE(p.payout_number, p.id::text),
  COALESCE(p.processed_at, p.completed_at, p.created_at, NOW())
FROM payouts p
WHERE p.status = 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM finance_transactions ft
    WHERE ft.payout_id = p.id
  )
ON CONFLICT (payout_id) WHERE payout_id IS NOT NULL DO NOTHING;
