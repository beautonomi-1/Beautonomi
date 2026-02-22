-- Beautonomi Database Migration
-- 031_provider_payout_accounts_and_transfer_fields.sql
-- Adds provider payout account storage (Paystack transfer recipient mapping) and fields for Paystack transfers on payouts

-- Provider payout accounts (store recipient_code + masked bank details)
CREATE TABLE IF NOT EXISTS provider_payout_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  recipient_code TEXT NOT NULL UNIQUE,
  recipient_id BIGINT,
  type TEXT NOT NULL, -- 'nuban', 'basa', 'mobile_money', etc.
  account_number_last4 TEXT,
  account_name TEXT,
  bank_code TEXT,
  bank_name TEXT,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_payout_accounts_provider ON provider_payout_accounts(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_payout_accounts_active ON provider_payout_accounts(provider_id, active) WHERE active = true;

CREATE TRIGGER update_provider_payout_accounts_updated_at BEFORE UPDATE ON provider_payout_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE provider_payout_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers can view own payout accounts"
  ON provider_payout_accounts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM providers p
      WHERE p.id = provider_payout_accounts.provider_id
      AND (
        p.user_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM provider_staff ps
          WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Superadmins can manage all payout accounts"
  ON provider_payout_accounts FOR ALL
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'superadmin'));

-- Payouts: add fields needed to connect to Paystack transfers
ALTER TABLE payouts
  ADD COLUMN IF NOT EXISTS recipient_code TEXT,
  ADD COLUMN IF NOT EXISTS transfer_code TEXT,
  ADD COLUMN IF NOT EXISTS transfer_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_payouts_recipient_code ON payouts(recipient_code);
CREATE INDEX IF NOT EXISTS idx_payouts_transfer_code ON payouts(transfer_code);

