-- Reconcile cron: target payments missing ledger rows; stale refund retry metadata.

ALTER TABLE public.stale_payment_refunds
  ADD COLUMN IF NOT EXISTS attempt_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.list_online_booking_payments_missing_ledger(
  p_provider TEXT,
  p_before TIMESTAMPTZ,
  p_limit INT
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

COMMENT ON FUNCTION public.list_online_booking_payments_missing_ledger(TEXT, TIMESTAMPTZ, INT) IS
  'Completed online booking_payments with no matching finance_transactions.payment for source_payment_id, excluding legacy bookings with unattributed payment rows.';
