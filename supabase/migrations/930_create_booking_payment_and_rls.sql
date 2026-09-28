-- Finance audit: server-only booking_payments writes for provider-collected tenders.

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

  IF v_booking.status IN ('cancelled', 'refunded', 'no_show') THEN
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

-- booking_payments: providers read-only
DROP POLICY IF EXISTS "Providers can manage payments" ON public.booking_payments;
DROP POLICY IF EXISTS "Providers can manage own booking payments" ON public.booking_payments;

DROP POLICY IF EXISTS "Providers can view own booking payments" ON public.booking_payments;
CREATE POLICY "Providers can view own booking payments"
  ON public.booking_payments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.providers p ON p.id = b.provider_id
      WHERE b.id = booking_payments.booking_id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.provider_staff ps
            WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
          )
        )
    )
  );

-- provider_paycloud_payments: no provider UPDATE (status/amount via service role only)
DROP POLICY IF EXISTS paycloud_payments_provider_update ON public.provider_paycloud_payments;

-- provider_invoices: providers read-only
DROP POLICY IF EXISTS "Providers can manage own invoices" ON public.provider_invoices;

DROP POLICY IF EXISTS "Providers can view own invoices" ON public.provider_invoices;
CREATE POLICY "Providers can view own invoices"
  ON public.provider_invoices
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_invoices.provider_id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.provider_staff ps
            WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
          )
        )
    )
  );
