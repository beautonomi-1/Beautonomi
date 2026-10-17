-- Phase 6: Customer wallet → bank refund (manual EFT, finance-approved).
--
-- Eligibility: only wallet credit that came from refunds of money captured by a card gateway
-- (paystack / stripe / flutterwave, excluding card-machine terminals) can go to a bank account.
-- Top-ups, gift cards, referral/promo credit and in-person payments never qualify.
--   booking source       = LEAST(booking_refund credits, gateway captured − gateway refunds to card)
--   product order source = LEAST(product_order_refund credits, online portion of the order)
--   eligible total       = LEAST(current wallet balance, Σ sources − amounts already allocated
--                          to pending / approved / paid requests)
--
-- Lifecycle: the amount is held (wallet debit) at submit, so it cannot be spent while finance
-- reviews it. Cancel (customer) or reject (finance) re-credits the hold. Paid is terminal.

CREATE TYPE public.wallet_bank_refund_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'paid',
  'cancelled'
);

CREATE TABLE IF NOT EXISTS public.customer_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  account_number_encrypted TEXT NOT NULL,
  account_number_last4 TEXT NOT NULL,
  account_name TEXT NOT NULL,
  bank_code TEXT NOT NULL,
  bank_name TEXT,
  country TEXT NOT NULL DEFAULT 'ZA',
  currency TEXT NOT NULL DEFAULT 'ZAR',
  recipient_type TEXT NOT NULL DEFAULT 'basa',
  payout_rail TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  verification_source TEXT CHECK (verification_source IN ('paystack', 'flutterwave', 'manual')),
  name_match TEXT NOT NULL DEFAULT 'unknown' CHECK (name_match IN ('match', 'partial', 'mismatch', 'unknown')),
  verified_at TIMESTAMPTZ,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_bank_accounts_user
  ON public.customer_bank_accounts(user_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_bank_accounts_one_primary
  ON public.customer_bank_accounts(user_id)
  WHERE deleted_at IS NULL AND is_primary = true;

CREATE TRIGGER update_customer_bank_accounts_updated_at
  BEFORE UPDATE ON public.customer_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE SEQUENCE IF NOT EXISTS public.wallet_bank_refund_request_seq;

CREATE TABLE IF NOT EXISTS public.wallet_bank_refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  customer_bank_account_id UUID NOT NULL REFERENCES public.customer_bank_accounts(id) ON DELETE RESTRICT,
  status public.wallet_bank_refund_status NOT NULL DEFAULT 'pending',
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  fee_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  net_amount NUMERIC(12, 2) NOT NULL CHECK (net_amount > 0),
  currency TEXT NOT NULL DEFAULT 'ZAR',
  -- Bank details frozen at submit so later edits/deletes cannot redirect an approved payout.
  bank_name TEXT,
  bank_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_number_last4 TEXT NOT NULL,
  account_number_encrypted TEXT NOT NULL,
  recipient_type TEXT,
  bank_country TEXT,
  customer_note TEXT,
  admin_notes TEXT,
  rejection_reason TEXT,
  bank_transfer_reference TEXT,
  hold_transaction_id UUID REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  release_transaction_id UUID REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  paid_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wallet_bank_refund_requests_net_matches CHECK (net_amount = amount - fee_amount)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_bank_refund_requests_idempotency
  ON public.wallet_bank_refund_requests(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_bank_refund_requests_one_open
  ON public.wallet_bank_refund_requests(user_id)
  WHERE status IN ('pending', 'approved');

CREATE INDEX IF NOT EXISTS idx_wallet_bank_refund_requests_user_status
  ON public.wallet_bank_refund_requests(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_bank_refund_requests_tenant_status
  ON public.wallet_bank_refund_requests(tenant_id, status, created_at DESC);

CREATE TRIGGER update_wallet_bank_refund_requests_updated_at
  BEFORE UPDATE ON public.wallet_bank_refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.wallet_bank_refund_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.wallet_bank_refund_requests(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('booking_refund', 'product_order_refund')),
  source_id UUID NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_bank_refund_request_items_request
  ON public.wallet_bank_refund_request_items(request_id);

CREATE INDEX IF NOT EXISTS idx_wallet_bank_refund_request_items_source
  ON public.wallet_bank_refund_request_items(source_type, source_id);

-- ── wallet_debit_admin (service role only) ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.wallet_debit_admin(
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
  v_tx_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  SELECT id, balance, currency INTO v_wallet_id, v_balance, v_currency
  FROM public.user_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  IF p_currency IS NOT NULL AND v_currency <> p_currency THEN
    RAISE EXCEPTION 'Currency mismatch (wallet: %, debit: %)', v_currency, p_currency;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_tx_id FROM public.wallet_transactions WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_tx_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'wallet_id', v_wallet_id,
        'balance', v_balance,
        'currency', v_currency,
        'wallet_transaction_id', v_tx_id,
        'idempotent', true
      );
    END IF;
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  UPDATE public.user_wallets SET balance = balance - p_amount WHERE id = v_wallet_id;

  INSERT INTO public.wallet_transactions (
    wallet_id, type, amount, description, reference_id, reference_type, tenant_id, idempotency_key
  )
  VALUES (
    v_wallet_id,
    'debit',
    p_amount,
    p_description,
    p_reference_id,
    p_reference_type,
    COALESCE(p_tenant_id, public.tenant_default_za_id()),
    p_idempotency_key
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'wallet_id', v_wallet_id,
    'balance', v_balance - p_amount,
    'currency', v_currency,
    'wallet_transaction_id', v_tx_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.wallet_debit_admin(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wallet_debit_admin(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.wallet_debit_admin(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_debit_admin(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID, TEXT) TO service_role;

-- ── Eligibility ──────────────────────────────────────────────────────────────

-- Per-source remaining eligible amount (oldest credit first), before the wallet-balance cap.
CREATE OR REPLACE FUNCTION public.wallet_bank_refund_eligible_sources(p_user_id UUID)
RETURNS TABLE (source_type TEXT, source_id UUID, eligible NUMERIC, first_credited_at TIMESTAMPTZ) AS $$
  WITH credits AS (
    SELECT wt.reference_type AS source_type,
           wt.reference_id AS source_id,
           SUM(wt.amount) AS credited,
           MIN(wt.created_at) AS first_at
    FROM public.wallet_transactions wt
    JOIN public.user_wallets w ON w.id = wt.wallet_id
    WHERE w.user_id = p_user_id
      AND wt.type = 'credit'
      AND wt.reference_type IN ('booking_refund', 'product_order_refund')
      AND wt.reference_id IS NOT NULL
    GROUP BY wt.reference_type, wt.reference_id
  ),
  booking_caps AS (
    SELECT c.source_id,
           GREATEST(
             COALESCE((
               SELECT SUM(bp.amount)
               FROM public.booking_payments bp
               WHERE bp.booking_id = c.source_id
                 AND lower(COALESCE(bp.payment_provider, '')) IN ('paystack', 'stripe', 'flutterwave')
                 AND lower(COALESCE(bp.payment_method, '')) <> 'paystack_terminal'
                 AND bp.status IN ('completed', 'partially_refunded', 'refunded')
             ), 0)
             - COALESCE((
               SELECT SUM(br.amount)
               FROM public.booking_refunds br
               WHERE br.booking_id = c.source_id
                 AND br.refund_method = 'original'
                 AND br.status IN ('pending', 'completed')
             ), 0),
             0
           ) AS cap
    FROM credits c
    JOIN public.bookings b ON b.id = c.source_id AND b.customer_id = p_user_id
    WHERE c.source_type = 'booking_refund'
  ),
  order_caps AS (
    SELECT c.source_id,
           GREATEST(
             COALESCE(o.total_amount, 0) - COALESCE(o.wallet_amount, 0) - COALESCE(o.gift_card_amount, 0),
             0
           ) AS cap
    FROM credits c
    JOIN public.product_orders o ON o.id = c.source_id AND o.customer_id = p_user_id
    WHERE c.source_type = 'product_order_refund'
      AND lower(COALESCE(o.payment_method, '')) IN ('paystack', 'stripe', 'flutterwave', 'card', 'online')
  ),
  allocated AS (
    SELECT i.source_type, i.source_id, SUM(i.amount) AS used
    FROM public.wallet_bank_refund_request_items i
    JOIN public.wallet_bank_refund_requests r ON r.id = i.request_id
    WHERE r.user_id = p_user_id
      AND r.status IN ('pending', 'approved', 'paid')
    GROUP BY i.source_type, i.source_id
  )
  SELECT c.source_type,
         c.source_id,
         ROUND(GREATEST(LEAST(c.credited, COALESCE(bc.cap, oc.cap, 0)) - COALESCE(a.used, 0), 0), 2) AS eligible,
         c.first_at
  FROM credits c
  LEFT JOIN booking_caps bc ON c.source_type = 'booking_refund' AND bc.source_id = c.source_id
  LEFT JOIN order_caps oc ON c.source_type = 'product_order_refund' AND oc.source_id = c.source_id
  LEFT JOIN allocated a ON a.source_type = c.source_type AND a.source_id = c.source_id
  WHERE COALESCE(bc.cap, oc.cap) IS NOT NULL
  ORDER BY c.first_at ASC;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.wallet_bank_refund_eligible_sources(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wallet_bank_refund_eligible_sources(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.wallet_bank_refund_eligible_sources(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_bank_refund_eligible_sources(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.wallet_bank_refund_eligible(p_user_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_balance NUMERIC := 0;
  v_sources NUMERIC := 0;
BEGIN
  SELECT COALESCE(balance, 0) INTO v_balance FROM public.user_wallets WHERE user_id = p_user_id;
  SELECT COALESCE(SUM(eligible), 0) INTO v_sources FROM public.wallet_bank_refund_eligible_sources(p_user_id);
  RETURN GREATEST(ROUND(LEAST(COALESCE(v_balance, 0), v_sources), 2), 0);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.wallet_bank_refund_eligible(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wallet_bank_refund_eligible(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.wallet_bank_refund_eligible(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_bank_refund_eligible(UUID) TO service_role;

-- ── Create (hold at submit) ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wallet_bank_refund_create(
  p_user_id UUID,
  p_bank_account_id UUID,
  p_amount NUMERIC,
  p_fee_amount NUMERIC,
  p_tenant_id UUID,
  p_customer_note TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_request public.wallet_bank_refund_requests%ROWTYPE;
  v_bank public.customer_bank_accounts%ROWTYPE;
  v_wallet_currency TEXT;
  v_eligible NUMERIC;
  v_amount NUMERIC := ROUND(p_amount, 2);
  v_fee NUMERIC := ROUND(COALESCE(p_fee_amount, 0), 2);
  v_id UUID := gen_random_uuid();
  v_hold JSONB;
  v_remaining NUMERIC;
  v_take NUMERIC;
  v_sort INT := 0;
  v_src RECORD;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_request FROM public.wallet_bank_refund_requests
    WHERE idempotency_key = p_idempotency_key AND user_id = p_user_id;
    IF FOUND THEN
      RETURN jsonb_build_object('request', to_jsonb(v_request), 'idempotent', true);
    END IF;
  END IF;

  -- Serialise concurrent submits for this user on the wallet row.
  SELECT currency INTO v_wallet_currency FROM public.user_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_wallet_currency IS NULL THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.wallet_bank_refund_requests
    WHERE user_id = p_user_id AND status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'OPEN_REQUEST_EXISTS';
  END IF;

  SELECT * INTO v_bank FROM public.customer_bank_accounts
  WHERE id = p_bank_account_id AND user_id = p_user_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BANK_ACCOUNT_NOT_FOUND';
  END IF;

  IF v_amount IS NULL OR v_amount <= 0 OR v_fee < 0 OR v_fee >= v_amount THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  v_eligible := public.wallet_bank_refund_eligible(p_user_id);
  IF v_amount > v_eligible THEN
    RAISE EXCEPTION 'AMOUNT_EXCEEDS_ELIGIBLE';
  END IF;

  INSERT INTO public.wallet_bank_refund_requests (
    id, request_number, user_id, tenant_id, customer_bank_account_id, status,
    amount, fee_amount, net_amount, currency,
    bank_name, bank_code, account_name, account_number_last4, account_number_encrypted,
    recipient_type, bank_country, customer_note, idempotency_key
  )
  VALUES (
    v_id,
    'WBR-' || TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYYMMDD') || '-'
      || LPAD(nextval('public.wallet_bank_refund_request_seq')::TEXT, 6, '0'),
    p_user_id, p_tenant_id, v_bank.id, 'pending',
    v_amount, v_fee, v_amount - v_fee, v_wallet_currency,
    v_bank.bank_name, v_bank.bank_code, v_bank.account_name, v_bank.account_number_last4,
    v_bank.account_number_encrypted, v_bank.recipient_type, v_bank.country,
    NULLIF(TRIM(p_customer_note), ''), p_idempotency_key
  )
  RETURNING * INTO v_request;

  v_remaining := v_amount;
  FOR v_src IN SELECT * FROM public.wallet_bank_refund_eligible_sources(p_user_id) LOOP
    EXIT WHEN v_remaining <= 0;
    CONTINUE WHEN v_src.eligible <= 0;
    v_take := LEAST(v_src.eligible, v_remaining);
    INSERT INTO public.wallet_bank_refund_request_items (request_id, source_type, source_id, amount, sort_order)
    VALUES (v_id, v_src.source_type, v_src.source_id, v_take, v_sort);
    v_sort := v_sort + 1;
    v_remaining := v_remaining - v_take;
  END LOOP;
  IF v_remaining > 0.005 THEN
    RAISE EXCEPTION 'AMOUNT_EXCEEDS_ELIGIBLE';
  END IF;

  v_hold := public.wallet_debit_admin(
    p_user_id,
    v_amount,
    v_wallet_currency,
    'Bank refund request ' || v_request.request_number || ' (on hold)',
    v_id,
    'bank_refund_hold',
    p_tenant_id,
    'bank_refund_hold:' || v_id::TEXT
  );

  UPDATE public.wallet_bank_refund_requests
  SET hold_transaction_id = (v_hold->>'wallet_transaction_id')::UUID
  WHERE id = v_id
  RETURNING * INTO v_request;

  RETURN jsonb_build_object('request', to_jsonb(v_request) - 'account_number_encrypted');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.wallet_bank_refund_create(UUID, UUID, NUMERIC, NUMERIC, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wallet_bank_refund_create(UUID, UUID, NUMERIC, NUMERIC, UUID, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.wallet_bank_refund_create(UUID, UUID, NUMERIC, NUMERIC, UUID, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_bank_refund_create(UUID, UUID, NUMERIC, NUMERIC, UUID, TEXT, TEXT) TO service_role;

-- ── Release (cancel by customer / reject by finance) ─────────────────────────

CREATE OR REPLACE FUNCTION public._wallet_bank_refund_release_hold(v_request public.wallet_bank_refund_requests)
RETURNS UUID AS $$
DECLARE
  v_tx_id UUID;
BEGIN
  IF v_request.hold_transaction_id IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM public.wallet_credit_admin(
    v_request.user_id,
    v_request.amount,
    v_request.currency,
    'Bank refund request ' || v_request.request_number || ' released — back in your wallet',
    v_request.id,
    'bank_refund_release',
    v_request.tenant_id,
    'bank_refund_release:' || v_request.id::TEXT
  );
  SELECT id INTO v_tx_id FROM public.wallet_transactions
  WHERE idempotency_key = 'bank_refund_release:' || v_request.id::TEXT
  LIMIT 1;
  RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public._wallet_bank_refund_release_hold(public.wallet_bank_refund_requests) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._wallet_bank_refund_release_hold(public.wallet_bank_refund_requests) FROM anon;
REVOKE ALL ON FUNCTION public._wallet_bank_refund_release_hold(public.wallet_bank_refund_requests) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._wallet_bank_refund_release_hold(public.wallet_bank_refund_requests) TO service_role;

CREATE OR REPLACE FUNCTION public.wallet_bank_refund_cancel(p_request_id UUID, p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_request public.wallet_bank_refund_requests%ROWTYPE;
  v_tx UUID;
BEGIN
  SELECT * INTO v_request FROM public.wallet_bank_refund_requests
  WHERE id = p_request_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'ONLY_PENDING_CAN_BE_CANCELLED';
  END IF;

  v_tx := public._wallet_bank_refund_release_hold(v_request);

  UPDATE public.wallet_bank_refund_requests
  SET status = 'cancelled', cancelled_at = NOW(), release_transaction_id = v_tx
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN jsonb_build_object('request', to_jsonb(v_request) - 'account_number_encrypted');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.wallet_bank_refund_cancel(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wallet_bank_refund_cancel(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.wallet_bank_refund_cancel(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_bank_refund_cancel(UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.wallet_bank_refund_reject(
  p_request_id UUID,
  p_admin_user_id UUID,
  p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_request public.wallet_bank_refund_requests%ROWTYPE;
  v_tx UUID;
BEGIN
  SELECT * INTO v_request FROM public.wallet_bank_refund_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND';
  END IF;
  IF v_request.status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'REQUEST_NOT_OPEN';
  END IF;

  v_tx := public._wallet_bank_refund_release_hold(v_request);

  UPDATE public.wallet_bank_refund_requests
  SET
    status = 'rejected',
    rejected_by = p_admin_user_id,
    rejected_at = NOW(),
    rejection_reason = NULLIF(TRIM(p_reason), ''),
    release_transaction_id = v_tx
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN jsonb_build_object('request', to_jsonb(v_request) - 'account_number_encrypted');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.wallet_bank_refund_reject(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wallet_bank_refund_reject(UUID, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.wallet_bank_refund_reject(UUID, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_bank_refund_reject(UUID, UUID, TEXT) TO service_role;

-- ── Approve / mark paid (finance) ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wallet_bank_refund_approve(
  p_request_id UUID,
  p_admin_user_id UUID,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_request public.wallet_bank_refund_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request FROM public.wallet_bank_refund_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'REQUEST_NOT_PENDING';
  END IF;

  UPDATE public.wallet_bank_refund_requests
  SET
    status = 'approved',
    approved_by = p_admin_user_id,
    approved_at = NOW(),
    admin_notes = COALESCE(NULLIF(TRIM(p_admin_notes), ''), admin_notes)
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN jsonb_build_object('request', to_jsonb(v_request) - 'account_number_encrypted');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.wallet_bank_refund_approve(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wallet_bank_refund_approve(UUID, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.wallet_bank_refund_approve(UUID, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_bank_refund_approve(UUID, UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.wallet_bank_refund_mark_paid(
  p_request_id UUID,
  p_admin_user_id UUID,
  p_transfer_reference TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_request public.wallet_bank_refund_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request FROM public.wallet_bank_refund_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND';
  END IF;
  IF v_request.status <> 'approved' THEN
    RAISE EXCEPTION 'REQUEST_NOT_APPROVED';
  END IF;
  IF NULLIF(TRIM(p_transfer_reference), '') IS NULL THEN
    RAISE EXCEPTION 'TRANSFER_REFERENCE_REQUIRED';
  END IF;

  UPDATE public.wallet_bank_refund_requests
  SET
    status = 'paid',
    paid_by = p_admin_user_id,
    paid_at = NOW(),
    bank_transfer_reference = TRIM(p_transfer_reference),
    admin_notes = COALESCE(NULLIF(TRIM(p_notes), ''), admin_notes)
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN jsonb_build_object('request', to_jsonb(v_request) - 'account_number_encrypted');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.wallet_bank_refund_mark_paid(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wallet_bank_refund_mark_paid(UUID, UUID, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.wallet_bank_refund_mark_paid(UUID, UUID, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_bank_refund_mark_paid(UUID, UUID, TEXT, TEXT) TO service_role;

-- ── RLS: owners read their own rows; all writes go through service-role APIs ──

ALTER TABLE public.customer_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_bank_refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_bank_refund_request_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers select own bank accounts"
  ON public.customer_bank_accounts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY "Customers select own wallet bank refund requests"
  ON public.wallet_bank_refund_requests FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Customers select own wallet bank refund items"
  ON public.wallet_bank_refund_request_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wallet_bank_refund_requests r
      WHERE r.id = wallet_bank_refund_request_items.request_id
        AND r.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.customer_bank_accounts IS 'Customer saved bank accounts for wallet bank refunds (encrypted account number; read by service role for finance EFT).';
COMMENT ON TABLE public.wallet_bank_refund_requests IS 'Customer requests to refund eligible card-payment wallet credit to a bank account (hold at submit, manual finance EFT).';
