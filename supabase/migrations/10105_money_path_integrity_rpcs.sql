-- 10105: Money path — parameterized integrity-report RPCs + repair idempotency table

CREATE TABLE IF NOT EXISTS public.finance_integrity_repairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_key text NOT NULL,
  idempotency_key text NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dry_run boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'applied'
    CHECK (status IN ('dry_run', 'applied', 'failed')),
  result jsonb,
  error_message text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repair_key, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_finance_integrity_repairs_tenant_created
  ON public.finance_integrity_repairs (tenant_id, created_at DESC);

COMMENT ON TABLE public.finance_integrity_repairs IS
  'Idempotency log for admin finance integrity repair actions (POST /api/admin/finance/integrity-repair).';

-- Extend missing-ledger scan with optional tenant filter (backward compatible 3-arg callers).
CREATE OR REPLACE FUNCTION public.list_online_booking_payments_missing_ledger(
  p_provider TEXT,
  p_before TIMESTAMPTZ,
  p_limit INT,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  booking_id UUID,
  amount NUMERIC,
  payment_provider TEXT,
  payment_provider_id TEXT,
  payment_provider_data JSONB,
  created_at TIMESTAMPTZ,
  booking_status TEXT,
  tenant_id UUID,
  currency TEXT,
  total_amount NUMERIC,
  payment_option TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    bp.id,
    bp.booking_id,
    bp.amount,
    bp.payment_provider,
    bp.payment_provider_id,
    bp.payment_provider_data,
    bp.created_at,
    b.status AS booking_status,
    b.tenant_id,
    b.currency,
    b.total_amount,
    b.payment_option
  FROM public.booking_payments bp
  INNER JOIN public.bookings b ON b.id = bp.booking_id
  WHERE bp.payment_provider = p_provider
    AND bp.status = 'completed'
    AND bp.created_at < p_before
    AND (p_tenant_id IS NULL OR b.tenant_id = p_tenant_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.finance_transactions ft
      WHERE ft.booking_id = bp.booking_id
        AND ft.transaction_type = 'payment'
        AND ft.source_payment_id = bp.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.finance_transactions ft
      WHERE ft.booking_id = bp.booking_id
        AND ft.transaction_type = 'payment'
        AND ft.source_payment_id IS NULL
    )
  ORDER BY bp.created_at ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 500));
$$;

CREATE OR REPLACE FUNCTION public.list_booking_payments_missing_provider_earnings(
  p_tenant_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  booking_payment_id UUID,
  booking_id UUID,
  amount NUMERIC,
  payment_provider TEXT,
  created_at TIMESTAMPTZ,
  tenant_id UUID,
  booking_number TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    bp.id AS booking_payment_id,
    bp.booking_id,
    bp.amount,
    bp.payment_provider,
    bp.created_at,
    b.tenant_id,
    b.booking_number
  FROM public.booking_payments bp
  INNER JOIN public.bookings b ON b.id = bp.booking_id
  WHERE bp.status = 'completed'
    AND bp.payment_provider IN ('paystack', 'stripe', 'flutterwave', 'wallet', 'gift_card')
    AND (p_tenant_id IS NULL OR b.tenant_id = p_tenant_id)
    AND EXISTS (
      SELECT 1 FROM public.finance_transactions ft
      WHERE ft.source_payment_id = bp.id
        AND ft.transaction_type = 'payment'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.finance_transactions ft
      WHERE ft.source_payment_id = bp.id
        AND ft.transaction_type = 'provider_earnings'
    )
  ORDER BY bp.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 500));
$$;

CREATE OR REPLACE FUNCTION public.list_integrity_overcharged_inclusive_bookings(
  p_tenant_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  booking_number TEXT,
  total_amount NUMERIC,
  tax_amount NUMERIC,
  tax_inclusive BOOLEAN,
  subtotal NUMERIC,
  travel_fee NUMERIC,
  created_at TIMESTAMPTZ,
  tenant_id UUID
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    b.id,
    b.booking_number,
    b.total_amount,
    b.tax_amount,
    b.tax_inclusive,
    b.subtotal,
    b.travel_fee,
    b.created_at,
    b.tenant_id
  FROM public.bookings b
  WHERE b.tax_inclusive IS TRUE
    AND COALESCE(b.tax_amount, 0) > 0
    AND b.total_amount > COALESCE(b.subtotal, 0) + COALESCE(b.travel_fee, 0) + COALESCE(b.tax_amount, 0) + 0.02
    AND (p_tenant_id IS NULL OR b.tenant_id = p_tenant_id)
  ORDER BY b.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 500));
$$;

CREATE OR REPLACE FUNCTION public.list_integrity_vat_debited_on_refunds(
  p_tenant_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  refund_id UUID,
  booking_id UUID,
  finance_transaction_id UUID,
  refund_component TEXT,
  amount NUMERIC,
  net NUMERIC,
  created_at TIMESTAMPTZ,
  tenant_id UUID
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    br.id AS refund_id,
    br.booking_id,
    ft.id AS finance_transaction_id,
    ft.refund_component,
    ft.amount,
    ft.net,
    ft.created_at,
    ft.tenant_id
  FROM public.booking_refunds br
  INNER JOIN public.finance_transactions ft ON ft.source_refund_id = br.id
  WHERE br.status = 'completed'
    AND ft.transaction_type = 'refund'
    AND ft.refund_component = 'tax'
    AND COALESCE(ft.net, 0) <> 0
    AND (p_tenant_id IS NULL OR ft.tenant_id = p_tenant_id)
  ORDER BY ft.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 500));
$$;

CREATE OR REPLACE FUNCTION public.list_integrity_deposit_tax_leak(
  p_tenant_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  booking_id UUID,
  booking_number TEXT,
  tax_amount NUMERIC,
  total_amount NUMERIC,
  tenant_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    b.id AS booking_id,
    b.booking_number,
    b.tax_amount,
    b.total_amount,
    b.tenant_id,
    b.created_at
  FROM public.bookings b
  WHERE COALESCE(b.tax_amount, 0) > 0
    AND (p_tenant_id IS NULL OR b.tenant_id = p_tenant_id)
    AND (
      b.payment_option = 'deposit'
      OR EXISTS (
        SELECT 1 FROM public.booking_payments bp
        WHERE bp.booking_id = b.id
          AND bp.status = 'completed'
          AND COALESCE(bp.payment_provider_data ->> 'payment_option', '') = 'deposit'
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.finance_transactions ft
      WHERE ft.booking_id = b.id AND ft.transaction_type = 'tax'
    )
    AND EXISTS (
      SELECT 1 FROM public.finance_transactions ft
      WHERE ft.booking_id = b.id AND ft.transaction_type = 'provider_earnings'
    )
  ORDER BY b.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 500));
$$;

CREATE OR REPLACE FUNCTION public.list_integrity_orphan_payout_ledger_rows(
  p_tenant_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  finance_transaction_id UUID,
  payout_id UUID,
  transaction_type TEXT,
  amount NUMERIC,
  net NUMERIC,
  tenant_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    ft.id AS finance_transaction_id,
    ft.payout_id,
    ft.transaction_type,
    ft.amount,
    ft.net,
    ft.tenant_id,
    ft.created_at
  FROM public.finance_transactions ft
  LEFT JOIN public.payouts p ON p.id = ft.payout_id
  WHERE ft.payout_id IS NOT NULL
    AND ft.transaction_type IN ('payout', 'payout_transfer_fee')
    AND p.id IS NULL
    AND (p_tenant_id IS NULL OR ft.tenant_id = p_tenant_id)
  ORDER BY ft.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 500));
$$;

CREATE OR REPLACE FUNCTION public.list_integrity_completed_payouts_without_ledger(
  p_tenant_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  payout_id UUID,
  provider_id UUID,
  amount NUMERIC,
  status TEXT,
  tenant_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.id AS payout_id,
    p.provider_id,
    p.amount,
    p.status,
    pr.tenant_id,
    p.created_at
  FROM public.payouts p
  LEFT JOIN public.providers pr ON pr.id = p.provider_id
  WHERE p.status = 'completed'
    AND (p_tenant_id IS NULL OR pr.tenant_id = p_tenant_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.finance_transactions ft
      WHERE ft.payout_id = p.id AND ft.transaction_type = 'payout'
    )
  ORDER BY p.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 500));
$$;

CREATE OR REPLACE FUNCTION public.list_integrity_vat_settings_violations(
  p_tenant_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  provider_id UUID,
  business_name TEXT,
  is_vat_registered BOOLEAN,
  tax_rate_percent NUMERIC,
  vat_number TEXT,
  tenant_id UUID
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.id AS provider_id,
    p.business_name,
    p.is_vat_registered,
    p.tax_rate_percent,
    p.vat_number,
    p.tenant_id
  FROM public.providers p
  WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
    AND (
      (p.is_vat_registered IS TRUE AND (p.tax_rate_percent IS NULL OR p.tax_rate_percent <= 0))
      OR (COALESCE(p.is_vat_registered, false) = false AND COALESCE(p.tax_rate_percent, 0) <> 0)
      OR (p.is_vat_registered IS TRUE AND (p.vat_number IS NULL OR btrim(p.vat_number) = ''))
    )
  ORDER BY p.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 500));
$$;

CREATE OR REPLACE FUNCTION public.list_integrity_charged_vat_without_registration(
  p_tenant_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  booking_id UUID,
  booking_number TEXT,
  tax_amount NUMERIC,
  provider_id UUID,
  tenant_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    b.id AS booking_id,
    b.booking_number,
    b.tax_amount,
    b.provider_id,
    b.tenant_id,
    b.created_at
  FROM public.bookings b
  INNER JOIN public.providers p ON p.id = b.provider_id
  WHERE COALESCE(b.tax_amount, 0) > 0
    AND COALESCE(p.is_vat_registered, false) = false
    AND (p_tenant_id IS NULL OR b.tenant_id = p_tenant_id)
  ORDER BY b.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 500));
$$;

CREATE OR REPLACE FUNCTION public.list_integrity_tax_rate_display_defects(
  p_tenant_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  booking_id UUID,
  booking_number TEXT,
  tax_rate NUMERIC,
  tax_amount NUMERIC,
  tenant_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    b.id AS booking_id,
    b.booking_number,
    b.tax_rate,
    b.tax_amount,
    b.tenant_id,
    b.created_at
  FROM public.bookings b
  WHERE COALESCE(b.tax_amount, 0) > 0
    AND b.tax_rate IS NOT NULL
    AND (
      (b.tax_rate > 0 AND b.tax_rate < 1)
      OR b.tax_rate > 100
    )
    AND (p_tenant_id IS NULL OR b.tenant_id = p_tenant_id)
  ORDER BY b.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 500));
$$;

CREATE OR REPLACE FUNCTION public.list_integrity_tax_rate_data_quality(
  p_tenant_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  provider_id UUID,
  business_name TEXT,
  tax_rate_percent NUMERIC,
  tax_rate_override_percent NUMERIC,
  tax_inclusive BOOLEAN,
  tenant_id UUID
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.id AS provider_id,
    p.business_name,
    p.tax_rate_percent,
    p.tax_rate_override_percent,
    p.tax_inclusive,
    p.tenant_id
  FROM public.providers p
  WHERE (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
    AND (
      (p.tax_rate_percent IS NOT NULL AND (p.tax_rate_percent <= 0 OR p.tax_rate_percent > 100))
      OR (
        p.tax_rate_override_percent IS NOT NULL
        AND (p.tax_rate_override_percent <= 0 OR p.tax_rate_override_percent > 100)
      )
    )
  ORDER BY p.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 500));
$$;

REVOKE ALL ON FUNCTION public.list_booking_payments_missing_provider_earnings(UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_integrity_overcharged_inclusive_bookings(UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_integrity_vat_debited_on_refunds(UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_integrity_deposit_tax_leak(UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_integrity_orphan_payout_ledger_rows(UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_integrity_completed_payouts_without_ledger(UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_integrity_vat_settings_violations(UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_integrity_charged_vat_without_registration(UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_integrity_tax_rate_display_defects(UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_integrity_tax_rate_data_quality(UUID, INT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_booking_payments_missing_provider_earnings(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_integrity_overcharged_inclusive_bookings(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_integrity_vat_debited_on_refunds(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_integrity_deposit_tax_leak(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_integrity_orphan_payout_ledger_rows(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_integrity_completed_payouts_without_ledger(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_integrity_vat_settings_violations(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_integrity_charged_vat_without_registration(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_integrity_tax_rate_display_defects(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_integrity_tax_rate_data_quality(UUID, INT) TO service_role;
