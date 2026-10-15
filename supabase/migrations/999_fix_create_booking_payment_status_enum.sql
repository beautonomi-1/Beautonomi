-- Fix create_booking_payment: booking_status has no 'refunded' value (refunds use payment_status).
-- Backfill: remove erroneous platform fee from provider-created group participant bookings.

CREATE OR REPLACE FUNCTION public.create_booking_payment(
  p_booking_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_payment_provider TEXT,
  p_status TEXT DEFAULT 'completed',
  p_notes TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_payment_provider_data JSONB DEFAULT NULL,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS SETOF public.booking_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
  v_amount NUMERIC;
  v_remaining NUMERIC;
  v_coverage NUMERIC;
  v_effective_paid NUMERIC;
  v_row public.booking_payments%ROWTYPE;
  v_provider_data JSONB;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = 'check_violation';
  END IF;

  IF p_payment_method NOT IN ('cash', 'card', 'bank_transfer', 'other') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD' USING ERRCODE = 'check_violation';
  END IF;

  IF p_payment_provider IS NULL OR p_payment_provider IN (
    'paystack', 'stripe', 'flutterwave', 'wallet', 'gift_card'
  ) THEN
    RAISE EXCEPTION 'PROVIDER_COLLECTED_ONLY' USING ERRCODE = 'check_violation';
  END IF;

  SELECT
    b.id,
    b.total_amount,
    b.total_paid,
    b.total_refunded,
    b.wallet_amount,
    b.gift_card_amount,
    b.status,
    b.tenant_id
  INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_booking.status::text IN ('cancelled', 'no_show') THEN
    RAISE EXCEPTION 'INVALID_BOOKING_STATUS' USING ERRCODE = 'check_violation';
  END IF;

  v_effective_paid := GREATEST(0, COALESCE(v_booking.total_paid, 0) - COALESCE(v_booking.total_refunded, 0));
  v_coverage := GREATEST(
    v_effective_paid,
    COALESCE(v_booking.wallet_amount, 0) + COALESCE(v_booking.gift_card_amount, 0)
  );
  v_remaining := GREATEST(0, COALESCE(v_booking.total_amount, 0) - v_coverage);
  v_amount := LEAST(p_amount, v_remaining);

  IF v_amount <= 0.005 THEN
    RAISE EXCEPTION 'NOTHING_OWING' USING ERRCODE = 'check_violation';
  END IF;

  IF p_reference IS NOT NULL AND trim(p_reference) <> '' THEN
    SELECT * INTO v_row
    FROM public.booking_payments bp
    WHERE bp.payment_provider = p_payment_provider
      AND bp.payment_provider_id = trim(p_reference)
    LIMIT 1;
    IF FOUND THEN
      RETURN NEXT v_row;
      RETURN;
    END IF;
  END IF;

  v_provider_data := COALESCE(p_payment_provider_data, '{}'::jsonb);

  INSERT INTO public.booking_payments (
    booking_id,
    amount,
    payment_method,
    payment_provider,
    payment_provider_id,
    payment_provider_data,
    status,
    notes,
    created_by,
    tenant_id
  )
  VALUES (
    p_booking_id,
    round(v_amount::numeric, 2),
    p_payment_method,
    p_payment_provider,
    NULLIF(trim(p_reference), ''),
    v_provider_data,
    COALESCE(NULLIF(p_status, ''), 'completed'),
    p_notes,
    p_created_by,
    COALESCE(p_tenant_id, v_booking.tenant_id)
  )
  RETURNING * INTO v_row;

  RETURN NEXT v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_booking_payment(
  UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, UUID
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_booking_payment(
  UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, UUID
) FROM anon;
REVOKE ALL ON FUNCTION public.create_booking_payment(
  UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, UUID
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_payment(
  UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, UUID
) TO service_role;

-- Remove the platform fee from provider-created group participant bookings where the
-- fee was never collected, then recompute payment_status with the
-- update_booking_payment_status rules (migration 595). Each row runs in its own
-- subtransaction: a row rejected by a bookings validation trigger is skipped with a
-- warning so it cannot block the create_booking_payment fix above.
DO $$
DECLARE
  r RECORD;
  v_total_paid NUMERIC;
  v_total_refunded NUMERIC;
  v_new_total NUMERIC;
  v_new_status TEXT;
  v_adjusted INT := 0;
  v_skipped INT := 0;
BEGIN
  FOR r IN
    SELECT b.id, b.total_amount, b.platform_fee_amount
    FROM public.bookings b
    WHERE b.group_booking_id IS NOT NULL
      AND b.booking_source = 'provider'
      AND COALESCE(b.platform_fee_amount, 0) > 0
      AND ABS(COALESCE(b.platform_fee_amount, 0) - COALESCE(b.service_fee_amount, 0)) <= 0.01
      AND b.status::text NOT IN ('cancelled', 'no_show')
      AND GREATEST(
            GREATEST(0, COALESCE(b.total_paid, 0) - COALESCE(b.total_refunded, 0)),
            COALESCE(b.wallet_amount, 0) + COALESCE(b.gift_card_amount, 0)
          ) <= COALESCE(b.total_amount, 0) - b.platform_fee_amount + 0.01
    FOR UPDATE
  LOOP
    BEGIN
      v_new_total := round((r.total_amount - r.platform_fee_amount)::numeric, 2);

      SELECT COALESCE(SUM(bp.amount), 0) INTO v_total_paid
      FROM public.booking_payments bp
      WHERE bp.booking_id = r.id
        AND bp.status::text IN ('completed', 'partially_refunded');

      SELECT COALESCE(SUM(br.amount), 0) INTO v_total_refunded
      FROM public.booking_refunds br
      WHERE br.booking_id = r.id
        AND br.status::text = 'completed';

      IF v_total_paid = 0 THEN
        v_new_status := 'pending';
      ELSIF v_total_refunded >= v_total_paid THEN
        v_new_status := 'refunded';
      ELSIF v_total_paid + 0.01 >= v_new_total THEN
        v_new_status := CASE WHEN v_total_refunded > 0 THEN 'partially_refunded' ELSE 'paid' END;
      ELSE
        v_new_status := 'partially_paid';
      END IF;

      UPDATE public.bookings
      SET
        total_amount = v_new_total,
        platform_fee_amount = 0,
        service_fee_amount = 0,
        platform_service_fee = 0,
        platform_fee_percentage = 0,
        service_fee_percentage = 0,
        payment_status = v_new_status::payment_status,
        total_paid = v_total_paid,
        total_refunded = v_total_refunded,
        updated_at = now()
      WHERE id = r.id;

      v_adjusted := v_adjusted + 1;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
      RAISE WARNING '999 group fee backfill skipped booking %: %', r.id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE '999 group fee backfill: adjusted %, skipped %', v_adjusted, v_skipped;
END;
$$;
