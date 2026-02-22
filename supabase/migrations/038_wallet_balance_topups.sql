-- Beautonomi Database Migration
-- 038_wallet_balance_topups.sql
-- Adds wallet topups + safe debit/credit functions for stored-money wallet.

-- Wallet topups (Paystack-funded)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_topup_status') THEN
    CREATE TYPE wallet_topup_status AS ENUM ('pending', 'paid', 'failed', 'cancelled');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS wallet_topups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'ZAR',
  status wallet_topup_status NOT NULL DEFAULT 'pending',
  paystack_reference TEXT,
  payment_url TEXT,
  paid_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  failure_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_topups_user ON wallet_topups(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_topups_status ON wallet_topups(status);
CREATE INDEX IF NOT EXISTS idx_wallet_topups_reference ON wallet_topups(paystack_reference) WHERE paystack_reference IS NOT NULL;

CREATE TRIGGER update_wallet_topups_updated_at
BEFORE UPDATE ON wallet_topups
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE wallet_topups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wallet topups"
  ON wallet_topups FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own wallet topups"
  ON wallet_topups FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pending wallet topups"
  ON wallet_topups FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending');

-- Booking: track wallet amount applied
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS wallet_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (wallet_amount >= 0);

CREATE INDEX IF NOT EXISTS idx_bookings_wallet_amount ON bookings(wallet_amount) WHERE wallet_amount > 0;

-- Atomic wallet operations
-- Self debit (authenticated user)
CREATE OR REPLACE FUNCTION wallet_debit_self(
  p_amount NUMERIC,
  p_description TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_wallet_id UUID;
  v_balance NUMERIC;
  v_currency TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT id, balance, currency INTO v_wallet_id, v_balance, v_currency
  FROM user_wallets
  WHERE user_id = auth.uid()
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    -- create wallet row defensively
    INSERT INTO user_wallets (user_id, currency) VALUES (auth.uid(), 'ZAR')
    RETURNING id, balance, currency INTO v_wallet_id, v_balance, v_currency;
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  UPDATE user_wallets SET balance = balance - p_amount WHERE id = v_wallet_id;

  INSERT INTO wallet_transactions (wallet_id, type, amount, description, reference_id, reference_type)
  VALUES (v_wallet_id, 'debit', p_amount, p_description, p_reference_id, p_reference_type);

  RETURN jsonb_build_object('wallet_id', v_wallet_id, 'balance', v_balance - p_amount, 'currency', v_currency);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION wallet_debit_self(NUMERIC, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wallet_debit_self(NUMERIC, TEXT, UUID, TEXT) TO authenticated;

-- Self credit (authenticated user)
CREATE OR REPLACE FUNCTION wallet_credit_self(
  p_amount NUMERIC,
  p_description TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_wallet_id UUID;
  v_balance NUMERIC;
  v_currency TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT id, balance, currency INTO v_wallet_id, v_balance, v_currency
  FROM user_wallets
  WHERE user_id = auth.uid()
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO user_wallets (user_id, currency) VALUES (auth.uid(), 'ZAR')
    RETURNING id, balance, currency INTO v_wallet_id, v_balance, v_currency;
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  UPDATE user_wallets SET balance = balance + p_amount WHERE id = v_wallet_id;

  INSERT INTO wallet_transactions (wallet_id, type, amount, description, reference_id, reference_type)
  VALUES (v_wallet_id, 'credit', p_amount, p_description, p_reference_id, p_reference_type);

  RETURN jsonb_build_object('wallet_id', v_wallet_id, 'balance', v_balance + p_amount, 'currency', v_currency);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION wallet_credit_self(NUMERIC, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wallet_credit_self(NUMERIC, TEXT, UUID, TEXT) TO authenticated;

-- Admin credit (service role only; used by webhooks)
CREATE OR REPLACE FUNCTION wallet_credit_admin(
  p_user_id UUID,
  p_amount NUMERIC,
  p_currency TEXT DEFAULT 'ZAR',
  p_description TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_wallet_id UUID;
  v_balance NUMERIC;
  v_currency TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  SELECT id, balance, currency INTO v_wallet_id, v_balance, v_currency
  FROM user_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO user_wallets (user_id, currency) VALUES (p_user_id, COALESCE(p_currency, 'ZAR'))
    RETURNING id, balance, currency INTO v_wallet_id, v_balance, v_currency;
  END IF;

  IF p_currency IS NOT NULL AND v_currency <> p_currency THEN
    RAISE EXCEPTION 'Currency mismatch (wallet: %, credit: %)', v_currency, p_currency;
  END IF;

  UPDATE user_wallets SET balance = balance + p_amount WHERE id = v_wallet_id;

  INSERT INTO wallet_transactions (wallet_id, type, amount, description, reference_id, reference_type)
  VALUES (v_wallet_id, 'credit', p_amount, p_description, p_reference_id, p_reference_type);

  RETURN jsonb_build_object('wallet_id', v_wallet_id, 'balance', v_balance + p_amount, 'currency', v_currency);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION wallet_credit_admin(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION wallet_credit_admin(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION wallet_credit_admin(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION wallet_credit_admin(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT) TO service_role;

