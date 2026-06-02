-- 652: refund ledger trigger — resolve tenant_id with fallback
--
-- create_finance_ledger_from_booking_refund() used the booking's raw tenant_id,
-- so refund finance rows for a booking with NULL tenant_id were posted with
-- tenant_id = NULL and dropped from tenant-scoped finance reports. This recreates
-- the function identically except v_tenant_id now falls back to the provider's
-- tenant and finally the default ZA tenant (mirrors create_finance_ledger_from_payment).

CREATE OR REPLACE FUNCTION public.create_finance_ledger_from_booking_refund()
RETURNS TRIGGER AS $$
DECLARE
  v_booking RECORD;
  v_tenant_id UUID;
  v_provider_id UUID;
  v_description TEXT;
  v_ratio NUMERIC(12, 8);
  v_total NUMERIC(12, 2);
  v_pe NUMERIC(12, 2);
  v_tip NUMERIC(12, 2);
  v_travel NUMERIC(12, 2);
  v_pf NUMERIC(12, 2);
  v_tax_amt NUMERIC(12, 2);
  v_pay_amt NUMERIC(12, 2);
  v_pay_comm NUMERIC(12, 2);
  v_cancel NUMERIC(12, 2);
  v_r_pe NUMERIC(12, 2);
  v_r_tip NUMERIC(12, 2);
  v_r_travel NUMERIC(12, 2);
  v_r_pf NUMERIC(12, 2);
  v_r_tax NUMERIC(12, 2);
  v_r_pay_amt NUMERIC(12, 2);
  v_r_comm NUMERIC(12, 2);
  v_r_cancel NUMERIC(12, 2);
  v_target NUMERIC(12, 2);
  v_sum_parts NUMERIC(12, 2);
  v_adj NUMERIC(12, 2);
  v_created_at TIMESTAMPTZ;
BEGIN
  -- F6 defense: if a refund was marked completed then failed, strip any posted reversals.
  IF TG_OP = 'UPDATE'
     AND OLD.status IS NOT DISTINCT FROM 'completed'
     AND NEW.status IS NOT DISTINCT FROM 'failed' THEN
    DELETE FROM public.finance_transactions WHERE source_refund_id = NEW.id;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.finance_transactions ft
    WHERE ft.source_refund_id = NEW.id
    LIMIT 1
  ) THEN
    RETURN NEW;
  END IF;

  SELECT id, provider_id, tenant_id, booking_number, COALESCE(total_amount, 0) AS total_amount
    INTO v_booking
    FROM public.bookings
   WHERE id = NEW.booking_id;

  IF NOT FOUND THEN
    RAISE NOTICE 'create_finance_ledger_from_booking_refund: booking % not found, skipping.', NEW.booking_id;
    RETURN NEW;
  END IF;

  v_provider_id := v_booking.provider_id;

  -- §Refund-tenant (audit 2026-06): never leave refund rows with NULL tenant_id.
  v_tenant_id := v_booking.tenant_id;
  IF v_tenant_id IS NULL AND v_provider_id IS NOT NULL THEN
    SELECT p.tenant_id INTO v_tenant_id FROM public.providers p WHERE p.id = v_provider_id;
  END IF;
  IF v_tenant_id IS NULL THEN
    v_tenant_id := public.tenant_default_za_id();
  END IF;

  v_description := format('Refund for booking %s (%s)',
    COALESCE(v_booking.booking_number, v_booking.id::text),
    COALESCE(NEW.reason, 'no reason supplied'));
  v_created_at := COALESCE(NEW.updated_at, NEW.created_at, NOW());

  v_total := GREATEST(v_booking.total_amount, 0.01);
  v_ratio := LEAST(1::NUMERIC, GREATEST(0::NUMERIC, (NEW.amount::NUMERIC) / v_total));

  SELECT COALESCE(SUM(net), 0) INTO v_pe
  FROM public.finance_transactions
  WHERE booking_id = NEW.booking_id
    AND transaction_type = 'provider_earnings'
    AND source_refund_id IS NULL
    AND COALESCE(net, 0) > 0;

  SELECT COALESCE(SUM(net), 0) INTO v_tip
  FROM public.finance_transactions
  WHERE booking_id = NEW.booking_id
    AND transaction_type = 'tip'
    AND source_refund_id IS NULL
    AND COALESCE(net, 0) > 0;

  SELECT COALESCE(SUM(net), 0) INTO v_travel
  FROM public.finance_transactions
  WHERE booking_id = NEW.booking_id
    AND transaction_type = 'travel_fee'
    AND source_refund_id IS NULL
    AND COALESCE(net, 0) > 0;

  SELECT COALESCE(SUM(net), 0) INTO v_pf
  FROM public.finance_transactions
  WHERE booking_id = NEW.booking_id
    AND transaction_type IN ('platform_fee', 'service_fee')
    AND source_refund_id IS NULL
    AND COALESCE(net, 0) > 0;

  SELECT COALESCE(SUM(amount), 0) INTO v_tax_amt
  FROM public.finance_transactions
  WHERE booking_id = NEW.booking_id
    AND transaction_type = 'tax'
    AND source_refund_id IS NULL
    AND COALESCE(amount, 0) > 0;

  SELECT COALESCE(SUM(amount), 0), COALESCE(SUM(commission), 0)
    INTO v_pay_amt, v_pay_comm
  FROM public.finance_transactions
  WHERE booking_id = NEW.booking_id
    AND transaction_type = 'payment'
    AND source_refund_id IS NULL;

  SELECT COALESCE(SUM(net), 0) INTO v_cancel
  FROM public.finance_transactions
  WHERE booking_id = NEW.booking_id
    AND transaction_type = 'cancellation_fee'
    AND source_refund_id IS NULL
    AND COALESCE(net, 0) > 0;

  v_r_pe := -ROUND(v_pe * v_ratio, 2);
  v_r_tip := -ROUND(v_tip * v_ratio, 2);
  v_r_travel := -ROUND(v_travel * v_ratio, 2);
  v_r_pf := -ROUND(v_pf * v_ratio, 2);
  v_r_tax := -ROUND(v_tax_amt * v_ratio, 2);
  v_r_pay_amt := -ROUND(v_pay_amt * v_ratio, 2);
  v_r_comm := -ROUND(v_pay_comm * v_ratio, 2);
  v_r_cancel := -ROUND(v_cancel * v_ratio, 2);

  -- If nothing was ever recognised on the ledger, fall back to the legacy single-row clawback.
  IF v_pe <= 0 AND v_tip <= 0 AND v_travel <= 0 AND v_pf <= 0 AND v_tax_amt <= 0 AND v_pay_amt <= 0 AND v_pay_comm <= 0 AND v_cancel <= 0 THEN
    INSERT INTO public.finance_transactions (
      tenant_id, booking_id, provider_id, source_payment_id, source_refund_id,
      refund_component, transaction_type, amount, fees, commission, net, description, created_at
    ) VALUES (
      v_tenant_id, NEW.booking_id, v_provider_id, NEW.payment_id, NEW.id,
      '_legacy', 'refund', NEW.amount, 0, 0, -NEW.amount, v_description, v_created_at
    );
    RETURN NEW;
  END IF;

  v_target := -NEW.amount::NUMERIC;
  -- Penny fix on provider slice only (tax rows keep net=0 per F7).
  v_sum_parts := v_r_pe + v_r_tip + v_r_travel + v_r_pf + v_r_comm + v_r_cancel;
  v_adj := v_target - v_sum_parts;
  v_r_pe := v_r_pe + v_adj;

  IF v_r_pe <> 0 THEN
    INSERT INTO public.finance_transactions (
      tenant_id, booking_id, provider_id, source_payment_id, source_refund_id,
      refund_component, transaction_type, amount, fees, commission, net, description, created_at
    ) VALUES (
      v_tenant_id, NEW.booking_id, v_provider_id, NEW.payment_id, NEW.id,
      'provider_earnings', 'refund', ABS(v_r_pe), 0, 0, v_r_pe, v_description, v_created_at
    );
  END IF;

  IF v_r_tip <> 0 THEN
    INSERT INTO public.finance_transactions (
      tenant_id, booking_id, provider_id, source_payment_id, source_refund_id,
      refund_component, transaction_type, amount, fees, commission, net, description, created_at
    ) VALUES (
      v_tenant_id, NEW.booking_id, v_provider_id, NEW.payment_id, NEW.id,
      'tip', 'refund', ABS(v_r_tip), 0, 0, v_r_tip, v_description, v_created_at
    );
  END IF;

  IF v_r_travel <> 0 THEN
    INSERT INTO public.finance_transactions (
      tenant_id, booking_id, provider_id, source_payment_id, source_refund_id,
      refund_component, transaction_type, amount, fees, commission, net, description, created_at
    ) VALUES (
      v_tenant_id, NEW.booking_id, v_provider_id, NEW.payment_id, NEW.id,
      'travel_fee', 'refund', ABS(v_r_travel), 0, 0, v_r_travel, v_description, v_created_at
    );
  END IF;

  IF v_r_pf <> 0 THEN
    INSERT INTO public.finance_transactions (
      tenant_id, booking_id, provider_id, source_payment_id, source_refund_id,
      refund_component, transaction_type, amount, fees, commission, net, description, created_at
    ) VALUES (
      v_tenant_id, NEW.booking_id, v_provider_id, NEW.payment_id, NEW.id,
      'platform_fee', 'refund', ABS(v_r_pf), 0, 0, v_r_pf, v_description, v_created_at
    );
  END IF;

  IF v_r_cancel <> 0 THEN
    INSERT INTO public.finance_transactions (
      tenant_id, booking_id, provider_id, source_payment_id, source_refund_id,
      refund_component, transaction_type, amount, fees, commission, net, description, created_at
    ) VALUES (
      v_tenant_id, NEW.booking_id, v_provider_id, NEW.payment_id, NEW.id,
      'cancellation_fee', 'refund', ABS(v_r_cancel), 0, 0, v_r_cancel, v_description, v_created_at
    );
  END IF;

  IF v_r_tax <> 0 THEN
    INSERT INTO public.finance_transactions (
      tenant_id, booking_id, provider_id, source_payment_id, source_refund_id,
      refund_component, transaction_type, amount, fees, commission, net, description, created_at
    ) VALUES (
      v_tenant_id, NEW.booking_id, v_provider_id, NEW.payment_id, NEW.id,
      'tax', 'refund', v_r_tax, 0, 0, 0, v_description, v_created_at
    );
  END IF;

  IF v_r_pay_amt <> 0 OR v_r_comm <> 0 THEN
    INSERT INTO public.finance_transactions (
      tenant_id, booking_id, provider_id, source_payment_id, source_refund_id,
      refund_component, transaction_type, amount, fees, commission, net, description, created_at
    ) VALUES (
      v_tenant_id, NEW.booking_id, v_provider_id, NEW.payment_id, NEW.id,
      'payment', 'refund', v_r_pay_amt, 0, v_r_comm, v_r_comm, v_description, v_created_at
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.create_finance_ledger_from_booking_refund() IS
  'F5: proportional reversals by component (provider_earnings/tip/travel/platform_fee/tax/payment commission). '
  'F6: completed->failed deletes posted rows. Legacy bookings with no recognition fall back to single _legacy row. '
  '652: tenant_id resolved with provider/default fallback so refund rows are never NULL-tenant.';
