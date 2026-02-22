-- Beautonomi Database Migration
-- 029_finance_transactions_provider_id.sql
-- Add provider_id to finance_transactions so provider metrics can include all provider revenue streams

ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES providers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_finance_transactions_provider_id ON finance_transactions(provider_id);

-- Backfill provider_id from booking_id where possible
UPDATE finance_transactions ft
SET provider_id = b.provider_id
FROM bookings b
WHERE ft.booking_id IS NOT NULL
  AND b.id = ft.booking_id
  AND ft.provider_id IS NULL;

-- Enable RLS (it was missing on this table)
ALTER TABLE finance_transactions ENABLE ROW LEVEL SECURITY;

-- Superadmins: full access
CREATE POLICY "Superadmins can manage all finance transactions"
  ON finance_transactions FOR ALL
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'superadmin'));

-- Providers: view finance transactions for their provider
CREATE POLICY "Providers can view own finance transactions"
  ON finance_transactions FOR SELECT
  USING (
    provider_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM providers p
      WHERE p.id = finance_transactions.provider_id
      AND (
        p.user_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM provider_staff ps
          WHERE ps.provider_id = p.id
          AND ps.user_id = auth.uid()
        )
      )
    )
  );

