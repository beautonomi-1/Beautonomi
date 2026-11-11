-- =============================================================================
-- 10139_audit_ledger_integrity.sql
-- Financial-systems audit (audit/05-findings.md) — ledger correctness fixes.
--
--   F2-06  sequential partial refunds mis-allocated components (denominator grew per refund)
--   F2-51 / F2-54  refund DELETE / completed->cancelled left ledger reversals (and GL) orphaned
--   F2-14  provider-portal / walk-in bookings posted a platform_fee row
--   F2-31  payment ledger trigger swallowed errors (payment committed with no ledger)
--   F2-07  tip allocations lost cents (ROUND per staff, no residual)
--   F2-53  staff earnings lines trigger fired before tip allocations existed (alphabetical order)
--   F4-07  reconciliation did not check component nets vs booking state or orphaned refund rows
--   F2-12  booking status guard was shadow-only for user sessions
--
-- Function bodies below are derived from the live definitions (hash-matched to
-- staging in audit/04-test-results.md §1) with the minimal edits marked F2-xx.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
-- Sum of what earlier completed refunds already reversed for one component.
CREATE OR REPLACE FUNCTION public.finance_refund_reversed(
  p_booking_id uuid, p_component text, p_col text, p_exclude_refund uuid
) RETURNS numeric
LANGUAGE sql STABLE
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
  SELECT COALESCE(SUM(
           CASE p_col WHEN 'amount' THEN ft.amount
                      WHEN 'commission' THEN ft.commission
                      ELSE ft.net END), 0)
    FROM public.finance_transactions ft
   WHERE ft.booking_id = p_booking_id
     AND ft.transaction_type = 'refund'
     AND ft.refund_component = p_component
     AND ft.source_refund_id IS NOT NULL
     AND ft.source_refund_id IS DISTINCT FROM p_exclude_refund;
$$;
REVOKE ALL ON FUNCTION public.finance_refund_reversed(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_refund_reversed(uuid, text, text, uuid) TO authenticated, service_role;

-- Remove the ledger reversals of one refund, reverting their GL journal first.
CREATE OR REPLACE FUNCTION public.finance_remove_refund_ledger(p_refund_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  r RECORD;
  v_n integer := 0;
BEGIN
  FOR r IN SELECT id FROM public.finance_transactions WHERE source_refund_id = p_refund_id LOOP
    PERFORM public.revert_journal_for_finance_tx(r.id);
    DELETE FROM public.finance_transactions WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.finance_remove_refund_ledger(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_remove_refund_ledger(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- F2-06 / F2-54  refund ledger trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_finance_ledger_from_booking_refund()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
  v_tax_flagged NUMERIC(12, 2);
  v_r_tax_vat_held NUMERIC(12, 2);
  v_pay_amt NUMERIC(12, 2);
  v_pay_comm NUMERIC(12, 2);
  v_cancel NUMERIC(12, 2);
  v_walkac NUMERIC(12, 2);
  v_acp_amt NUMERIC(12, 2);
  v_acp_comm NUMERIC(12, 2);
  v_promo NUMERIC(12, 2);
  v_memb NUMERIC(12, 2);
  v_loy NUMERIC(12, 2);
  v_wallet NUMERIC(12, 2);
  v_gift NUMERIC(12, 2);
  v_gclr NUMERIC(12, 2);
  v_r_pe NUMERIC(12, 2);
  v_r_tip NUMERIC(12, 2);
  v_r_travel NUMERIC(12, 2);
  v_r_pf NUMERIC(12, 2);
  v_r_tax NUMERIC(12, 2);
  v_r_pay_amt NUMERIC(12, 2);
  v_r_comm NUMERIC(12, 2);
  v_r_cancel NUMERIC(12, 2);
  v_r_walkac NUMERIC(12, 2);
  v_r_acp_amt NUMERIC(12, 2);
  v_r_acp_comm NUMERIC(12, 2);
  v_r_promo NUMERIC(12, 2);
  v_r_memb NUMERIC(12, 2);
  v_r_loy NUMERIC(12, 2);
  v_r_wallet NUMERIC(12, 2);
  v_r_gift NUMERIC(12, 2);
  v_r_gclr NUMERIC(12, 2);
  v_target NUMERIC(12, 2);
  v_sum_parts NUMERIC(12, 2);
  v_adj NUMERIC(12, 2);
  v_created_at TIMESTAMPTZ;
  v_paid_total NUMERIC(12, 2);
  v_prior_refunds NUMERIC(12, 2);
  v_remaining_cash NUMERIC(12, 2);
BEGIN
  -- F6 / F2-54: a completed refund that is failed or cancelled must take its
  -- ledger reversals (and their GL journal) with it.
  IF TG_OP = 'UPDATE'
     AND OLD.status IS NOT DISTINCT FROM 'completed'
     AND NEW.status IN ('failed', 'cancelled') THEN
    PERFORM public.finance_remove_refund_ledger(NEW.id);
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

  SELECT id, provider_id, tenant_id, booking_number, COALESCE(total_amount, 0) AS total_amount, COALESCE(cancellation_fee, 0) AS cancellation_fee, COALESCE(total_paid, 0) AS total_paid, COALESCE(total_refunded, 0) AS total_refunded
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

  -- F2-06: allocate this refund against what is still outstanding on the booking.
  -- The previous denominator (total_paid + total_refunded) grew with every refund,
  -- so sequential partial refunds under-reversed fees/VAT and over-clawed earnings.
  SELECT COALESCE(SUM(bp.amount), 0) INTO v_paid_total
    FROM public.booking_payments bp
   WHERE bp.booking_id = NEW.booking_id
     AND bp.status IN ('completed', 'partially_refunded', 'refunded');
  SELECT COALESCE(SUM(br.amount), 0) INTO v_prior_refunds
    FROM public.booking_refunds br
   WHERE br.booking_id = NEW.booking_id
     AND br.status = 'completed'
     AND br.id <> NEW.id;
  v_remaining_cash := ROUND(v_paid_total - v_prior_refunds, 2);

  IF v_remaining_cash > 0 THEN
    IF NEW.amount::NUMERIC >= v_remaining_cash - 0.005 THEN
      v_ratio := 1;  -- final refund: zero every component exactly
    ELSE
      v_ratio := LEAST(1::NUMERIC, GREATEST(0::NUMERIC, NEW.amount::NUMERIC / v_remaining_cash));
    END IF;
  ELSE
    -- No recorded payments (legacy / externally settled): fall back to booking totals.
    v_total := GREATEST(COALESCE(v_booking.total_amount, 0) + COALESCE(v_booking.cancellation_fee, 0), COALESCE(v_booking.total_paid, 0) + COALESCE(v_booking.total_refunded, 0), 0.01);
    v_ratio := LEAST(1::NUMERIC, GREATEST(0::NUMERIC, (NEW.amount::NUMERIC) / v_total));
  END IF;

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

  SELECT COALESCE(SUM(amount), 0) INTO v_tax_flagged
  FROM public.finance_transactions
  WHERE booking_id = NEW.booking_id
    AND transaction_type = 'tax'
    AND source_refund_id IS NULL
    AND COALESCE(amount, 0) > 0
    AND COALESCE((metadata->>'vat_held_for_provider')::boolean, false);

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

  -- Provider-collected add-on (full net, no commission split).
  SELECT COALESCE(SUM(net), 0) INTO v_walkac
  FROM public.finance_transactions
  WHERE booking_id = NEW.booking_id
    AND transaction_type = 'walk_in_additional_charge'
    AND source_refund_id IS NULL
    AND COALESCE(net, 0) > 0;

  -- Online add-on platform commission (sibling provider_earnings already in v_pe).
  SELECT COALESCE(SUM(amount), 0), COALESCE(SUM(commission), 0)
    INTO v_acp_amt, v_acp_comm
  FROM public.finance_transactions
  WHERE booking_id = NEW.booking_id
    AND transaction_type = 'additional_charge_payment'
    AND source_refund_id IS NULL;

  -- Reporting / tender / liability movements (parallel to cash economics).
  SELECT COALESCE(SUM(net), 0) INTO v_promo
  FROM public.finance_transactions
  WHERE booking_id = NEW.booking_id
    AND transaction_type = 'promotion_discount'
    AND source_refund_id IS NULL
    AND COALESCE(net, 0) < 0;

  -- Membership & loyalty discounts are contra-revenue too (posted by 655/656/
  -- charge-success/process-payment), so they must reverse on refund for GMV symmetry.
  SELECT COALESCE(SUM(net), 0) INTO v_memb
  FROM public.finance_transactions
  WHERE booking_id = NEW.booking_id
    AND transaction_type = 'membership_discount'
    AND source_refund_id IS NULL
    AND COALESCE(net, 0) < 0;

  SELECT COALESCE(SUM(net), 0) INTO v_loy
  FROM public.finance_transactions
  WHERE booking_id = NEW.booking_id
    AND transaction_type = 'loyalty_redemption'
    AND source_refund_id IS NULL
    AND COALESCE(net, 0) < 0;

  SELECT COALESCE(SUM(net), 0) INTO v_wallet
  FROM public.finance_transactions
  WHERE booking_id = NEW.booking_id
    AND transaction_type = 'wallet_payment'
    AND source_refund_id IS NULL
    AND COALESCE(net, 0) > 0;

  SELECT COALESCE(SUM(net), 0) INTO v_gift
  FROM public.finance_transactions
  WHERE booking_id = NEW.booking_id
    AND transaction_type = 'gift_card_payment'
    AND source_refund_id IS NULL
    AND COALESCE(net, 0) > 0;

  SELECT COALESCE(SUM(net), 0) INTO v_gclr
  FROM public.finance_transactions
  WHERE booking_id = NEW.booking_id
    AND transaction_type = 'gift_card_liability_reduction'
    AND source_refund_id IS NULL
    AND COALESCE(net, 0) < 0;

  -- F2-06: reduce each original component by what earlier completed refunds already reversed,
  -- so the ratio applies to the remaining balance of every component.
  v_pe       := GREATEST(0, v_pe       + public.finance_refund_reversed(NEW.booking_id, 'provider_earnings', 'net', NEW.id));
  v_tip      := GREATEST(0, v_tip      + public.finance_refund_reversed(NEW.booking_id, 'tip', 'net', NEW.id));
  v_travel   := GREATEST(0, v_travel   + public.finance_refund_reversed(NEW.booking_id, 'travel_fee', 'net', NEW.id));
  v_pf       := GREATEST(0, v_pf       + public.finance_refund_reversed(NEW.booking_id, 'platform_fee', 'net', NEW.id));
  v_tax_amt  := GREATEST(0, v_tax_amt  + public.finance_refund_reversed(NEW.booking_id, 'tax', 'amount', NEW.id));
  v_tax_flagged := GREATEST(0, v_tax_flagged - COALESCE((
      SELECT SUM((ft.metadata->>'vat_held_for_provider_amount')::NUMERIC)
        FROM public.finance_transactions ft
       WHERE ft.booking_id = NEW.booking_id AND ft.transaction_type = 'refund' AND ft.refund_component = 'tax'
         AND ft.source_refund_id IS NOT NULL AND ft.source_refund_id IS DISTINCT FROM NEW.id
         AND ft.metadata ? 'vat_held_for_provider_amount'), 0));
  v_pay_amt  := GREATEST(0, v_pay_amt  + public.finance_refund_reversed(NEW.booking_id, 'payment', 'amount', NEW.id));
  v_pay_comm := GREATEST(0, v_pay_comm + public.finance_refund_reversed(NEW.booking_id, 'payment', 'commission', NEW.id));
  v_cancel   := GREATEST(0, v_cancel   + public.finance_refund_reversed(NEW.booking_id, 'cancellation_fee', 'net', NEW.id));
  v_walkac   := GREATEST(0, v_walkac   + public.finance_refund_reversed(NEW.booking_id, 'walk_in_additional_charge', 'net', NEW.id));
  v_acp_amt  := GREATEST(0, v_acp_amt  + public.finance_refund_reversed(NEW.booking_id, 'additional_charge_payment', 'amount', NEW.id));
  v_acp_comm := GREATEST(0, v_acp_comm + public.finance_refund_reversed(NEW.booking_id, 'additional_charge_payment', 'commission', NEW.id));
  v_promo    := LEAST(0, v_promo       + public.finance_refund_reversed(NEW.booking_id, 'promotion_discount', 'net', NEW.id));
  v_memb     := LEAST(0, v_memb        + public.finance_refund_reversed(NEW.booking_id, 'membership_discount', 'net', NEW.id));
  v_loy      := LEAST(0, v_loy         + public.finance_refund_reversed(NEW.booking_id, 'loyalty_redemption', 'net', NEW.id));
  v_wallet   := GREATEST(0, v_wallet   + public.finance_refund_reversed(NEW.booking_id, 'wallet_payment', 'net', NEW.id));
  v_gift     := GREATEST(0, v_gift     + public.finance_refund_reversed(NEW.booking_id, 'gift_card_payment', 'net', NEW.id));
  v_gclr     := LEAST(0, v_gclr        + public.finance_refund_reversed(NEW.booking_id, 'gift_card_liability_reduction', 'net', NEW.id));

  v_r_pe := -ROUND(v_pe * v_ratio, 2);
  v_r_tip := -ROUND(v_tip * v_ratio, 2);
  v_r_travel := -ROUND(v_travel * v_ratio, 2);
  v_r_pf := -ROUND(v_pf * v_ratio, 2);
  v_r_tax := -ROUND(v_tax_amt * v_ratio, 2);
  v_r_tax_vat_held := -ROUND(v_tax_flagged * v_ratio, 2);
  v_r_pay_amt := -ROUND(v_pay_amt * v_ratio, 2);
  v_r_comm := -ROUND(v_pay_comm * v_ratio, 2);
  v_r_cancel := -ROUND(v_cancel * v_ratio, 2);
  v_r_walkac := -ROUND(v_walkac * v_ratio, 2);
  v_r_acp_amt := -ROUND(v_acp_amt * v_ratio, 2);
  v_r_acp_comm := -ROUND(v_acp_comm * v_ratio, 2);
  v_r_promo := -ROUND(v_promo * v_ratio, 2);
  v_r_memb := -ROUND(v_memb * v_ratio, 2);
  v_r_loy := -ROUND(v_loy * v_ratio, 2);
  v_r_wallet := -ROUND(v_wallet * v_ratio, 2);
  v_r_gift := -ROUND(v_gift * v_ratio, 2);
  v_r_gclr := -ROUND(v_gclr * v_ratio, 2);

  -- If nothing was ever recognised on the ledger, fall back to the legacy single-row clawback.
  IF v_pe <= 0 AND v_tip <= 0 AND v_travel <= 0 AND v_pf <= 0 AND v_tax_amt <= 0
     AND v_pay_amt <= 0 AND v_pay_comm <= 0 AND v_cancel <= 0
     AND v_walkac <= 0 AND v_acp_amt <= 0 AND v_acp_comm <= 0 THEN
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
  -- Penny fix on provider slice only (tax rows keep net=0 per F7). Cash refund total
  -- includes tax amount legs; provider_earnings absorbs only the residual penny.
  v_sum_parts := v_r_pe + v_r_tip + v_r_travel + v_r_pf + v_r_tax + v_r_comm + v_r_cancel
                 + v_r_walkac + v_r_acp_comm;
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
      refund_component, transaction_type, amount, fees, commission, net, description, created_at, metadata
    ) VALUES (
      v_tenant_id, NEW.booking_id, v_provider_id, NEW.payment_id, NEW.id,
      'tax', 'refund', v_r_tax, 0, 0, 0, v_description, v_created_at,
      CASE
        WHEN v_r_tax_vat_held <> 0 THEN jsonb_build_object('vat_held_for_provider_amount', ABS(v_r_tax_vat_held))
        ELSE '{}'::jsonb
      END
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

  -- Provider-collected add-on reversal (full net).
  IF v_r_walkac <> 0 THEN
    INSERT INTO public.finance_transactions (
      tenant_id, booking_id, provider_id, source_payment_id, source_refund_id,
      refund_component, transaction_type, amount, fees, commission, net, description, created_at
    ) VALUES (
      v_tenant_id, NEW.booking_id, v_provider_id, NEW.payment_id, NEW.id,
      'walk_in_additional_charge', 'refund', ABS(v_r_walkac), 0, 0, v_r_walkac, v_description, v_created_at
    );
  END IF;

  -- Online add-on platform commission reversal.
  IF v_r_acp_amt <> 0 OR v_r_acp_comm <> 0 THEN
    INSERT INTO public.finance_transactions (
      tenant_id, booking_id, provider_id, source_payment_id, source_refund_id,
      refund_component, transaction_type, amount, fees, commission, net, description, created_at
    ) VALUES (
      v_tenant_id, NEW.booking_id, v_provider_id, NEW.payment_id, NEW.id,
      'additional_charge_payment', 'refund', v_r_acp_amt, 0, v_r_acp_comm, v_r_acp_comm, v_description, v_created_at
    );
  END IF;

  -- Parallel (non-cash) reversals. These are posted as transaction_type='refund' (the
  -- single, consistent refund mechanism) tagged with a distinct refund_component, NOT
  -- under their original transaction_type. Reusing the original type would (a) make a
  -- reversal indistinguishable from a fresh discount/tender row to settlement-time
  -- idempotency checks (e.g. charge-success's single-row maybeSingle on
  -- promotion_discount) and amount-summing consumers, and (b) fork refund accounting
  -- across two conventions. Instead, every refund consumer attributes a refund row by
  -- refund_component (see lib/ledger/refund-components.ts): provider-facing surfaces
  -- count only provider components; these non-cash legs are excluded there and netted
  -- by component elsewhere. They are NOT part of the cash penny-balance above.

  -- Promotion discount contra-reversal (reporting/GMV symmetry).
  IF v_r_promo <> 0 THEN
    INSERT INTO public.finance_transactions (
      tenant_id, booking_id, provider_id, source_payment_id, source_refund_id,
      refund_component, transaction_type, amount, fees, commission, net, description, created_at
    ) VALUES (
      v_tenant_id, NEW.booking_id, v_provider_id, NEW.payment_id, NEW.id,
      'promotion_discount', 'refund', ABS(v_r_promo), 0, 0, v_r_promo, v_description, v_created_at
    );
  END IF;

  -- Membership discount contra-reversal (reporting/GMV symmetry).
  IF v_r_memb <> 0 THEN
    INSERT INTO public.finance_transactions (
      tenant_id, booking_id, provider_id, source_payment_id, source_refund_id,
      refund_component, transaction_type, amount, fees, commission, net, description, created_at
    ) VALUES (
      v_tenant_id, NEW.booking_id, v_provider_id, NEW.payment_id, NEW.id,
      'membership_discount', 'refund', ABS(v_r_memb), 0, 0, v_r_memb, v_description, v_created_at
    );
  END IF;

  -- Loyalty redemption contra-reversal (reporting/GMV symmetry).
  IF v_r_loy <> 0 THEN
    INSERT INTO public.finance_transactions (
      tenant_id, booking_id, provider_id, source_payment_id, source_refund_id,
      refund_component, transaction_type, amount, fees, commission, net, description, created_at
    ) VALUES (
      v_tenant_id, NEW.booking_id, v_provider_id, NEW.payment_id, NEW.id,
      'loyalty_redemption', 'refund', ABS(v_r_loy), 0, 0, v_r_loy, v_description, v_created_at
    );
  END IF;

  -- Wallet tender leg reversal (GL/audit parity; not provider-payoutable).
  IF v_r_wallet <> 0 THEN
    INSERT INTO public.finance_transactions (
      tenant_id, booking_id, provider_id, source_payment_id, source_refund_id,
      refund_component, transaction_type, amount, fees, commission, net, description, created_at
    ) VALUES (
      v_tenant_id, NEW.booking_id, v_provider_id, NEW.payment_id, NEW.id,
      'wallet_payment', 'refund', ABS(v_r_wallet), 0, 0, v_r_wallet, v_description, v_created_at
    );
  END IF;

  -- Gift card tender leg reversal.
  IF v_r_gift <> 0 THEN
    INSERT INTO public.finance_transactions (
      tenant_id, booking_id, provider_id, source_payment_id, source_refund_id,
      refund_component, transaction_type, amount, fees, commission, net, description, created_at
    ) VALUES (
      v_tenant_id, NEW.booking_id, v_provider_id, NEW.payment_id, NEW.id,
      'gift_card_payment', 'refund', ABS(v_r_gift), 0, 0, v_r_gift, v_description, v_created_at
    );
  END IF;

  -- Gift card liability re-establishment (undo the redemption's liability_reduction).
  IF v_r_gclr <> 0 THEN
    INSERT INTO public.finance_transactions (
      tenant_id, booking_id, provider_id, source_payment_id, source_refund_id,
      refund_component, transaction_type, amount, fees, commission, net, description, created_at
    ) VALUES (
      v_tenant_id, NEW.booking_id, v_provider_id, NEW.payment_id, NEW.id,
      'gift_card_liability_reduction', 'refund', ABS(v_r_gclr), 0, 0, v_r_gclr, v_description, v_created_at
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- -----------------------------------------------------------------------------
-- F2-51  deleting a refund removes its ledger reversals (+ GL revert)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.booking_refunds_remove_ledger_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
BEGIN
  PERFORM public.finance_remove_refund_ledger(OLD.id);
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_booking_refunds_remove_ledger_on_delete ON public.booking_refunds;
CREATE TRIGGER trg_booking_refunds_remove_ledger_on_delete
  AFTER DELETE ON public.booking_refunds
  FOR EACH ROW EXECUTE FUNCTION public.booking_refunds_remove_ledger_on_delete();

-- -----------------------------------------------------------------------------
-- F2-14 / F2-31  payment ledger trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_finance_ledger_from_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_booking RECORD;
    v_tenant_id UUID;
    v_platform_commission_rate NUMERIC(5, 4);
    v_commission_pct NUMERIC(5, 2);
    v_commission_base NUMERIC(10, 2);
    v_platform_commission NUMERIC(10, 2);
    v_provider_earnings NUMERIC(10, 2);
    v_is_online_booking BOOLEAN;
    v_payment_amount NUMERIC(10, 2);
    v_total_amount NUMERIC(10, 2);
    v_net_ratio NUMERIC(10, 6);
    v_has_existing_booking_items BOOLEAN;
    v_cumulative_paid NUMERIC(10, 2);
    v_posted_legs NUMERIC(10, 2);
    v_pf NUMERIC(10, 2);
    v_is_walk_in_additional_charge BOOLEAN;
    v_is_platform_held BOOLEAN;
    v_payment_option TEXT;
    v_requires_deposit BOOLEAN;
    v_post_booking_level_fees BOOLEAN;
    v_vat_payout_enabled BOOLEAN;
BEGIN
    IF NEW.status != 'completed' THEN
        RETURN NEW;
    END IF;

    IF NEW.payment_provider IN ('paystack', 'stripe', 'flutterwave') THEN
        RETURN NEW;
    END IF;

    IF EXISTS (SELECT 1 FROM public.finance_transactions ft WHERE ft.source_payment_id = NEW.id) THEN
        RETURN NEW;
    END IF;

    IF NEW.payment_provider IN ('wallet', 'gift_card') THEN
        IF EXISTS (
            SELECT 1 FROM public.finance_transactions ft
            WHERE ft.booking_id = NEW.booking_id
              AND ft.transaction_type = 'payment'
        ) THEN
            RETURN NEW;
        END IF;
    END IF;

    v_is_walk_in_additional_charge := (
        NEW.payment_provider_data IS NOT NULL
        AND NEW.payment_provider_data ->> 'source' = 'walk_in'
        AND COALESCE(NEW.payment_provider_data ->> 'additional_charge_id', '') <> ''
    );

    SELECT
        b.id,
        b.booking_number,
        b.provider_id,
        b.tenant_id,
        b.total_amount,
        b.commission_percentage_snapshot,
        COALESCE(NULLIF(b.platform_fee_amount, 0), b.service_fee_amount, 0) AS platform_fee_amount,
        COALESCE(b.tip_amount, 0) AS tip_amount,
        COALESCE(b.tax_amount, 0) AS tax_amount,
        COALESCE(b.travel_fee, 0) AS travel_fee,
        COALESCE(b.booking_source, 'online') AS booking_source,
        b.promotion_id,
        COALESCE(b.promotion_discount_amount, 0) AS promotion_discount_amount,
        COALESCE(b.membership_discount_amount, 0) AS membership_discount_amount,
        COALESCE(b.loyalty_discount_amount, 0) AS loyalty_discount_amount
    INTO v_booking
    FROM public.bookings b
    WHERE b.id = NEW.booking_id;

    IF NOT FOUND THEN
        RAISE WARNING 'Booking not found for payment: %', NEW.booking_id;
        RETURN NEW;
    END IF;

    v_tenant_id := COALESCE(
        v_booking.tenant_id,
        (SELECT p.tenant_id FROM public.providers p WHERE p.id = v_booking.provider_id),
        public.tenant_default_za_id()
    );

    IF COALESCE(NEW.payment_provider_data ->> 'tip', '') = 'true' THEN
        INSERT INTO public.finance_transactions (
            tenant_id, booking_id, provider_id, source_payment_id,
            transaction_type, amount, fees, commission, net, description, created_at
        ) VALUES (
            v_tenant_id, NEW.booking_id, v_booking.provider_id, NEW.id,
            'tip', NEW.amount, 0, 0, NEW.amount,
            'Card machine tip for booking ' || v_booking.booking_number,
            NOW()
        );
        RETURN NEW;
    END IF;

    v_payment_option := COALESCE(NEW.payment_provider_data ->> 'payment_option', 'full');
    v_requires_deposit := (
        COALESCE((NEW.payment_provider_data ->> 'requires_deposit')::BOOLEAN, false)
        OR lower(COALESCE(NEW.payment_provider_data ->> 'requires_deposit', '')) IN ('true', '1', 'yes')
    );
    v_post_booking_level_fees := NOT (v_requires_deposit AND v_payment_option = 'deposit');

    v_commission_pct := COALESCE(
        v_booking.commission_percentage_snapshot,
        public.resolve_provider_commission_percentage(v_booking.provider_id, v_tenant_id)
    );
    v_platform_commission_rate := COALESCE(v_commission_pct, 0) / 100;

    v_is_platform_held := (NEW.payment_provider IN ('wallet', 'gift_card', 'stripe', 'flutterwave'));
    IF NOT v_is_platform_held THEN
        v_platform_commission_rate := 0;
    END IF;

    SELECT COALESCE(
        (SELECT ff.enabled FROM public.feature_flags ff
          WHERE ff.feature_key = 'finance.provider_vat_payout' AND ff.tenant_id IS NULL
          LIMIT 1),
        false
    ) INTO v_vat_payout_enabled;

    v_is_online_booking := (v_booking.booking_source = 'online');
    v_payment_amount := NEW.amount;
    v_total_amount := GREATEST(v_booking.total_amount, 0.01);
    v_pf := COALESCE(v_booking.platform_fee_amount, 0);

    -- F2-14: provider-portal / walk-in bookings carry no customer platform fee;
    -- never recognise one or shrink provider earnings by it (restores 1027 intent).
    IF v_booking.booking_source IN ('provider', 'walk_in') THEN
        v_pf := 0;
    END IF;

    v_net_ratio := GREATEST(
        0,
        (v_total_amount - v_pf - v_booking.tax_amount - v_booking.travel_fee - v_booking.tip_amount)
    ) / v_total_amount;

    v_has_existing_booking_items := EXISTS (
        SELECT 1 FROM public.finance_transactions ft
        WHERE ft.booking_id = NEW.booking_id
          AND ft.transaction_type IN ('tip', 'tax', 'travel_fee', 'platform_fee', 'service_fee', 'promotion_discount', 'membership_discount', 'loyalty_redemption')
    );

    IF v_has_existing_booking_items THEN
        SELECT COALESCE(SUM(bp2.amount), 0) INTO v_cumulative_paid
        FROM public.booking_payments bp2
        WHERE bp2.booking_id = NEW.booking_id
          AND bp2.status IN ('completed', 'partially_refunded');

        SELECT COALESCE(SUM(
            CASE
              WHEN ft.transaction_type = 'tax' THEN COALESCE(ft.amount, 0)
              ELSE COALESCE(ft.net, 0)
            END
        ), 0) INTO v_posted_legs
        FROM public.finance_transactions ft
        WHERE ft.booking_id = NEW.booking_id
          AND ft.transaction_type IN ('provider_earnings', 'payment',
            'platform_fee', 'service_fee', 'tip', 'tax', 'travel_fee')
          AND (
            ft.transaction_type = 'tax'
            OR COALESCE(ft.net, 0) > 0
          );

        v_commission_base := LEAST(
            v_payment_amount,
            GREATEST(0, ROUND(v_cumulative_paid - v_posted_legs, 2))
        );
    ELSE
        v_commission_base := ROUND(v_payment_amount * v_net_ratio, 2);
    END IF;

    v_platform_commission := ROUND(v_commission_base * v_platform_commission_rate, 2);
    v_provider_earnings := v_commission_base - v_platform_commission;

    IF v_platform_commission > 0 THEN
        INSERT INTO public.finance_transactions (
            tenant_id, booking_id, provider_id, source_payment_id,
            transaction_type, amount, fees, commission, net, description, created_at
        ) VALUES (
            v_tenant_id, NEW.booking_id, v_booking.provider_id, NEW.id,
            'payment', v_commission_base, 0, v_platform_commission, v_platform_commission,
            'Payment for booking ' || v_booking.booking_number || ' (via ' || NEW.payment_method || ')',
            NOW()
        );
    END IF;

    IF NOT v_is_walk_in_additional_charge THEN
        INSERT INTO public.finance_transactions (
            tenant_id, booking_id, provider_id, source_payment_id,
            transaction_type, amount, fees, commission, net, description, created_at
        ) VALUES (
            v_tenant_id, NEW.booking_id, v_booking.provider_id, NEW.id,
            'provider_earnings', v_provider_earnings, 0, 0, v_provider_earnings,
            'Provider earnings for booking ' || v_booking.booking_number || ' (via ' || NEW.payment_method || ', source: ' || v_booking.booking_source || ')',
            NOW()
        );
    END IF;

    IF NOT v_has_existing_booking_items AND v_post_booking_level_fees THEN
        IF v_pf > 0 THEN
            INSERT INTO public.finance_transactions (
                tenant_id, booking_id, provider_id, source_payment_id,
                transaction_type, amount, fees, commission, net, description, created_at
            ) VALUES (
                v_tenant_id, NEW.booking_id, v_booking.provider_id, NEW.id,
                'platform_fee', v_pf, 0, 0, v_pf,
                'Platform fee for booking ' || v_booking.booking_number,
                NOW()
            );
        END IF;

        IF v_booking.promotion_discount_amount > 0 AND v_booking.promotion_id IS NOT NULL THEN
            INSERT INTO public.finance_transactions (
                tenant_id, booking_id, provider_id, source_payment_id,
                transaction_type, amount, fees, commission, net, description, created_at
            ) VALUES (
                v_tenant_id, NEW.booking_id, v_booking.provider_id, NEW.id,
                'promotion_discount', v_booking.promotion_discount_amount, 0, 0, -v_booking.promotion_discount_amount,
                'Promotion discount for booking ' || v_booking.booking_number,
                NOW()
            );
        END IF;

        IF v_booking.membership_discount_amount > 0 THEN
            INSERT INTO public.finance_transactions (
                tenant_id, booking_id, provider_id, source_payment_id,
                transaction_type, amount, fees, commission, net, description, created_at
            ) VALUES (
                v_tenant_id, NEW.booking_id, v_booking.provider_id, NEW.id,
                'membership_discount', v_booking.membership_discount_amount, 0, 0, -v_booking.membership_discount_amount,
                'Membership discount for booking ' || v_booking.booking_number,
                NOW()
            );
        END IF;

        IF v_booking.loyalty_discount_amount > 0 THEN
            INSERT INTO public.finance_transactions (
                tenant_id, booking_id, provider_id, source_payment_id,
                transaction_type, amount, fees, commission, net, description, created_at
            ) VALUES (
                v_tenant_id, NEW.booking_id, v_booking.provider_id, NEW.id,
                'loyalty_redemption', v_booking.loyalty_discount_amount, 0, 0, -v_booking.loyalty_discount_amount,
                'Loyalty redemption for booking ' || v_booking.booking_number,
                NOW()
            );
        END IF;

        IF v_booking.tip_amount > 0 THEN
            INSERT INTO public.finance_transactions (
                tenant_id, booking_id, provider_id, source_payment_id,
                transaction_type, amount, fees, commission, net, description, created_at
            ) VALUES (
                v_tenant_id, NEW.booking_id, v_booking.provider_id, NEW.id,
                'tip', v_booking.tip_amount, 0, 0, v_booking.tip_amount,
                'Tip for booking ' || v_booking.booking_number,
                NOW()
            );
        END IF;

        IF v_booking.tax_amount > 0 THEN
            INSERT INTO public.finance_transactions (
                tenant_id, booking_id, provider_id, source_payment_id,
                transaction_type, amount, fees, commission, net, description, created_at, metadata
            ) VALUES (
                v_tenant_id, NEW.booking_id, v_booking.provider_id, NEW.id,
                'tax', v_booking.tax_amount, 0, 0, 0,
                'Tax (VAT) for booking ' || v_booking.booking_number,
                NOW(),
                CASE
                  WHEN v_is_platform_held AND v_vat_payout_enabled THEN jsonb_build_object('vat_held_for_provider', true)
                  ELSE '{}'::jsonb
                END
            );
        END IF;

        IF v_booking.travel_fee > 0 THEN
            INSERT INTO public.finance_transactions (
                tenant_id, booking_id, provider_id, source_payment_id,
                transaction_type, amount, fees, commission, net, description, created_at
            ) VALUES (
                v_tenant_id, NEW.booking_id, v_booking.provider_id, NEW.id,
                'travel_fee', v_booking.travel_fee, 0, 0, v_booking.travel_fee,
                'Travel fee for booking ' || v_booking.booking_number,
                NOW()
            );
        END IF;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- F2-31: fail closed. A completed payment must never commit without its
        -- ledger rows; the API surfaces the error and gateways retry the webhook.
        RAISE EXCEPTION 'finance ledger posting failed for booking % payment %: %', NEW.booking_id, NEW.id, SQLERRM
            USING ERRCODE = 'P0001',
                  HINT = 'create_finance_ledger_from_payment rolled back the payment insert (F2-31 fail-closed).';
END;
$function$;

-- -----------------------------------------------------------------------------
-- F2-07  tip allocations: largest-remainder so allocations sum to the tip total
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_tip_allocations_on_tip_transaction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_distribute boolean;
    v_total_price numeric := 0;
    v_total_tips numeric := 0;
    v_total_cents bigint;
    v_alloc_cents bigint := 0;
    v_remainder bigint;
    v_staff RECORD;
    v_ids uuid[] := '{}';
    v_cents bigint[] := '{}';
    v_frac numeric[] := '{}';
    v_i int;
    v_j int;
    v_raw numeric;
BEGIN
    IF NEW.transaction_type != 'tip' OR NEW.amount IS NULL OR NEW.amount <= 0 OR NEW.booking_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(pt.distribute_to_staff, false) INTO v_distribute
    FROM provider_tip_settings pt
    WHERE pt.provider_id = NEW.provider_id;

    IF NOT COALESCE(v_distribute, false) THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(SUM(bs.price), 0) INTO v_total_price
    FROM booking_services bs
    WHERE bs.booking_id = NEW.booking_id AND bs.staff_id IS NOT NULL AND bs.price > 0;

    IF v_total_price <= 0 THEN
        RETURN NEW;
    END IF;

    -- Total tips so far on this booking (includes NEW; AFTER INSERT trigger).
    SELECT COALESCE(SUM(ft.amount), 0) INTO v_total_tips
    FROM finance_transactions ft
    WHERE ft.booking_id = NEW.booking_id
      AND ft.transaction_type = 'tip'
      AND ft.amount > 0;

    IF v_total_tips <= 0 THEN
        RETURN NEW;
    END IF;

    v_total_cents := ROUND(v_total_tips * 100);

    FOR v_staff IN
        SELECT bs.staff_id, SUM(bs.price) AS staff_total
        FROM booking_services bs
        WHERE bs.booking_id = NEW.booking_id AND bs.staff_id IS NOT NULL AND bs.price > 0
        GROUP BY bs.staff_id
        ORDER BY SUM(bs.price) DESC, bs.staff_id
    LOOP
        v_raw := v_total_cents * v_staff.staff_total / v_total_price;
        v_ids := v_ids || v_staff.staff_id;
        v_cents := v_cents || FLOOR(v_raw)::bigint;
        v_frac := v_frac || (v_raw - FLOOR(v_raw));
        v_alloc_cents := v_alloc_cents + FLOOR(v_raw)::bigint;
    END LOOP;

    -- Hand out the remaining cents to the largest fractional parts (ties: larger share first).
    v_remainder := v_total_cents - v_alloc_cents;
    WHILE v_remainder > 0 LOOP
        v_j := NULL;
        FOR v_i IN 1 .. array_length(v_ids, 1) LOOP
            IF v_j IS NULL OR v_frac[v_i] > v_frac[v_j] THEN
                v_j := v_i;
            END IF;
        END LOOP;
        v_cents[v_j] := v_cents[v_j] + 1;
        v_frac[v_j] := -1;  -- consumed
        v_remainder := v_remainder - 1;
    END LOOP;

    FOR v_i IN 1 .. array_length(v_ids, 1) LOOP
        IF v_cents[v_i] > 0 THEN
            INSERT INTO booking_tip_allocations (booking_id, staff_id, amount)
            VALUES (NEW.booking_id, v_ids[v_i], v_cents[v_i] / 100.0)
            ON CONFLICT (booking_id, staff_id) DO UPDATE SET amount = EXCLUDED.amount;
        END IF;
    END LOOP;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error creating tip allocations for booking %: %', NEW.booking_id, SQLERRM;
        RETURN NEW;
END;
$function$;

-- -----------------------------------------------------------------------------
-- F2-53  tip allocations must exist before staff earnings lines are derived.
--        AFTER triggers fire alphabetically; "aab_" sorts after the "aaa_" cashback
--        triggers and before "create_staff_earnings_lines_on_finance_tx".
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'create_tip_allocations_on_tip' AND tgrelid = 'public.finance_transactions'::regclass) THEN
    ALTER TRIGGER create_tip_allocations_on_tip ON public.finance_transactions RENAME TO aab_create_tip_allocations_on_tip;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- F4-07  reconciliation: booking-level component drift and orphaned refund rows
-- -----------------------------------------------------------------------------
-- Fully refunded bookings must net to 0.00 on every cash component.
CREATE OR REPLACE FUNCTION public.reconciliation_booking_component_drift(p_tolerance numeric DEFAULT 0.004)
RETURNS TABLE(booking_id uuid, component text, residual numeric)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
  WITH fully_refunded AS (
    SELECT b.id
      FROM public.bookings b
     WHERE COALESCE(b.total_paid, 0) > 0
       AND COALESCE(b.total_refunded, 0) >= COALESCE(b.total_paid, 0) - 0.005
  ),
  nets AS (
    SELECT ft.booking_id,
           COALESCE(ft.refund_component, ft.transaction_type) AS component,
           SUM(CASE WHEN COALESCE(ft.refund_component, ft.transaction_type) = 'tax' THEN COALESCE(ft.amount, 0) ELSE COALESCE(ft.net, 0) END) AS residual
      FROM public.finance_transactions ft
      JOIN fully_refunded fr ON fr.id = ft.booking_id
     WHERE COALESCE(ft.refund_component, ft.transaction_type) IN
           ('provider_earnings', 'platform_fee', 'service_fee', 'tax', 'tip', 'travel_fee', 'cancellation_fee', 'walk_in_additional_charge')
     GROUP BY ft.booking_id, COALESCE(ft.refund_component, ft.transaction_type)
  )
  SELECT n.booking_id, n.component, n.residual
    FROM nets n
   WHERE abs(n.residual) > p_tolerance;
$$;
REVOKE ALL ON FUNCTION public.reconciliation_booking_component_drift(numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconciliation_booking_component_drift(numeric) TO service_role;

-- Refund ledger rows whose parent refund is missing or not completed.
CREATE OR REPLACE FUNCTION public.reconciliation_orphan_refund_rows()
RETURNS TABLE(finance_tx_id uuid, booking_id uuid, source_refund_id uuid, parent_status text, net numeric)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
  SELECT ft.id, ft.booking_id, ft.source_refund_id, br.status, ft.net
    FROM public.finance_transactions ft
    LEFT JOIN public.booking_refunds br ON br.id = ft.source_refund_id
   WHERE ft.transaction_type = 'refund'
     AND ft.source_refund_id IS NOT NULL
     AND (br.id IS NULL OR br.status IS DISTINCT FROM 'completed');
$$;
REVOKE ALL ON FUNCTION public.reconciliation_orphan_refund_rows() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconciliation_orphan_refund_rows() TO service_role;

-- Raises when either booking-level check finds rows (companion to reconciliation_assert_zero_drift).
CREATE OR REPLACE FUNCTION public.reconciliation_assert_booking_integrity(p_tolerance numeric DEFAULT 0.004)
RETURNS TABLE(component_drift_rows bigint, orphan_refund_rows bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_drift bigint;
  v_orphans bigint;
BEGIN
  SELECT count(*) INTO v_drift FROM public.reconciliation_booking_component_drift(p_tolerance);
  SELECT count(*) INTO v_orphans FROM public.reconciliation_orphan_refund_rows();
  IF v_drift > 0 OR v_orphans > 0 THEN
    RAISE EXCEPTION 'booking-level reconciliation failed: component_drift_rows=% orphan_refund_rows=%', v_drift, v_orphans
      USING ERRCODE = '40000';
  END IF;
  RETURN QUERY SELECT v_drift, v_orphans;
END;
$$;
REVOKE ALL ON FUNCTION public.reconciliation_assert_booking_integrity(numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconciliation_assert_booking_integrity(numeric) TO service_role;

-- -----------------------------------------------------------------------------
-- F2-12  booking status guard: enforce for user sessions (service role and
--        maintenance sessions keep the app-level validation as their control).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_booking_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_allowed BOOLEAN;
  v_location TEXT;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- service_role / backend writers, and direct maintenance sessions (SQL editor, migrations).
  -- current_user is the function owner under SECURITY DEFINER, so session_user is checked.
  -- F2-12: a maintenance session only bypasses when no JWT claims are present, so a
  -- user JWT is always enforced regardless of the connecting role.
  IF COALESCE(auth.role(), '') = 'service_role'
     OR COALESCE(current_setting('role', true), '') = 'service_role'
     OR (COALESCE(auth.role(), '') = '' AND session_user IN ('postgres', 'supabase_admin')) THEN
    RETURN NEW;
  END IF;

  v_location := COALESCE(NEW.location_type::TEXT, '');

  IF public.is_superadmin() THEN
    IF OLD.status IN ('completed', 'cancelled', 'no_show') AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_allowed := (OLD.status = 'completed' AND NEW.status = 'cancelled');
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    v_allowed := public.booking_status_transition_allowed(
      OLD.status::TEXT,
      NEW.status::TEXT,
      v_location
    );
  END IF;

  IF NOT v_allowed THEN
    -- F2-12: enforce. The violation row is kept for forensics in case the caller
    -- catches the error inside a savepoint; otherwise it rolls back with the update.
    INSERT INTO public.booking_status_transition_violations (
      booking_id, from_status, to_status, location_type, db_role, session_user_name, context
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      NEW.location_type,
      COALESCE(auth.role(), current_setting('role', true)),
      session_user,
      jsonb_build_object('trigger_mode', 'enforce')
    );
    RAISE EXCEPTION 'Invalid booking status transition % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;
