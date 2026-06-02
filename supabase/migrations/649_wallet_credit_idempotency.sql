-- 649: Wallet credit idempotency
--
-- Several wallet-credit paths (top-up heal, gift-card redemption, booking
-- payment-failed reversal, product-order reversal, cancellation refunds) could
-- double-credit a customer when a webhook was delivered twice or a request was
-- retried, because `wallet_credit_admin` had no DB-level idempotency — only
-- best-effort application guards.
--
-- This migration adds an optional caller-supplied idempotency key to
-- `wallet_transactions` (unique when present) and teaches `wallet_credit_admin`
-- to no-op when a credit with the same key already exists. Callers that must
-- credit at most once pass a stable key (e.g. `wallet_topup:<id>`); callers that
-- legitimately credit multiple times against the same reference (e.g. multiple
-- partial refunds) simply omit the key, preserving existing behaviour.

ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_transactions_idempotency_key
  ON public.wallet_transactions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Replace wallet_credit_admin with an idempotency-aware version. Drop the old
-- 7-arg signature first so we do not leave an ambiguous overload for PostgREST.
DROP FUNCTION IF EXISTS public.wallet_credit_admin(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.wallet_credit_admin(
  p_user_id UUID,
  p_amount NUMERIC,
  p_currency TEXT DEFAULT 'ZAR',
  p_description TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL,
  p_tenant_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
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

  -- Idempotency: if a credit with this key already exists, do nothing and report
  -- the current balance. We hold FOR UPDATE on the wallet row above, so
  -- concurrent same-key calls for this user serialize here; the unique index is
  -- a hard backstop across all paths.
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM wallet_transactions WHERE idempotency_key = p_idempotency_key
    ) THEN
      RETURN jsonb_build_object(
        'wallet_id', v_wallet_id,
        'balance', v_balance,
        'currency', v_currency,
        'idempotent', true
      );
    END IF;
  END IF;

  UPDATE user_wallets SET balance = balance + p_amount WHERE id = v_wallet_id;

  INSERT INTO wallet_transactions (
    wallet_id, type, amount, description, reference_id, reference_type, tenant_id, idempotency_key
  )
  VALUES (
    v_wallet_id,
    'credit',
    p_amount,
    p_description,
    p_reference_id,
    p_reference_type,
    COALESCE(p_tenant_id, public.tenant_default_za_id()),
    p_idempotency_key
  );

  RETURN jsonb_build_object('wallet_id', v_wallet_id, 'balance', v_balance + p_amount, 'currency', v_currency);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.wallet_credit_admin(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wallet_credit_admin(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.wallet_credit_admin(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_credit_admin(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID, TEXT) TO service_role;
