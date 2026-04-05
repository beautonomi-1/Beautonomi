-- Market attribution on wallet ledger lines (referrals, topups, booking-tied credits).

ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

COMMENT ON COLUMN wallet_transactions.tenant_id IS 'Market/tenant for admin finance rollups (booking tenant, topup tenant, etc.).';

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_tenant_id
  ON wallet_transactions (tenant_id)
  WHERE tenant_id IS NOT NULL;

-- Ensure user_referrals can link to the conversion booking (may already exist from app migrations).
ALTER TABLE user_referrals
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings(id);

CREATE INDEX IF NOT EXISTS idx_user_referrals_booking_id
  ON user_referrals (booking_id)
  WHERE booking_id IS NOT NULL;

-- Backfill referral credits: conversion booking's tenant wins (not referrer home tenant).
UPDATE wallet_transactions wt
SET tenant_id = b.tenant_id
FROM user_referrals ur
JOIN bookings b ON b.id = ur.booking_id
WHERE wt.reference_type = 'referral'
  AND wt.reference_id = ur.id
  AND wt.tenant_id IS NULL
  AND ur.booking_id IS NOT NULL
  AND b.tenant_id IS NOT NULL;

-- Service-role admin credit: optional market tag on the ledger row.
DROP FUNCTION IF EXISTS wallet_credit_admin(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION wallet_credit_admin(
  p_user_id UUID,
  p_amount NUMERIC,
  p_currency TEXT DEFAULT 'ZAR',
  p_description TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL,
  p_tenant_id UUID DEFAULT NULL
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

  INSERT INTO wallet_transactions (wallet_id, type, amount, description, reference_id, reference_type, tenant_id)
  VALUES (v_wallet_id, 'credit', p_amount, p_description, p_reference_id, p_reference_type, p_tenant_id);

  RETURN jsonb_build_object('wallet_id', v_wallet_id, 'balance', v_balance + p_amount, 'currency', v_currency);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION wallet_credit_admin(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION wallet_credit_admin(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID) FROM anon;
REVOKE ALL ON FUNCTION wallet_credit_admin(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION wallet_credit_admin(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID) TO service_role;
