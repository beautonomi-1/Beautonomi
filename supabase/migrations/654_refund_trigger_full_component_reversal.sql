-- 654: refund ledger trigger — full component reversal
--
-- Extends create_finance_ledger_from_booking_refund() (last set in 652) so a
-- completed refund proportionally reverses EVERY economic component that was
-- recognised on the booking, not just provider_earnings/tip/travel/platform_fee/
-- tax/payment/cancellation_fee. Newly reversed components:
--
--   Cash economics (folded into the penny-balanced -NEW.amount total):
--     - walk_in_additional_charge   (provider-collected add-on, full net)
--     - additional_charge_payment   (online add-on platform commission;
--                                    its provider_earnings sibling is already
--                                    captured by the provider_earnings sum)
--
--   Reporting / tender / liability movements (posted as transaction_type='refund'
--   with a distinct refund_component, NOT additive to the cash penny-balance above —
--   they are parallel representations of the same refund). Provider-facing consumers
--   ignore these components via lib/ledger/refund-components.ts:
--     - promotion_discount          (contra-revenue, net < 0 → reversal net > 0)
--     - membership_discount         (contra-revenue, net < 0 → reversal net > 0)
--     - loyalty_redemption          (contra-revenue, net < 0 → reversal net > 0)
--     - wallet_payment              (tender leg, net > 0 → reversal net < 0)
--     - gift_card_payment           (tender leg, net > 0 → reversal net < 0)
--     - gift_card_liability_reduction (liability unwind, net < 0 → reversal net > 0)
--
-- Sign convention is uniform: reversal = -(original * ratio). Idempotency is
-- preserved by the unique (source_refund_id, refund_component) index — each new
-- component is a distinct refund_component value. The 652 tenant fallback and the
-- F6 completed->failed cleanup are retained unchanged.

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

  v_r_pe := -ROUND(v_pe * v_ratio, 2);
  v_r_tip := -ROUND(v_tip * v_ratio, 2);
  v_r_travel := -ROUND(v_travel * v_ratio, 2);
  v_r_pf := -ROUND(v_pf * v_ratio, 2);
  v_r_tax := -ROUND(v_tax_amt * v_ratio, 2);
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
  -- Penny fix on provider slice only (tax rows keep net=0 per F7). The cash refund
  -- total comprises the provider take, tips, travel, platform fee, base + add-on
  -- commission, cancellation fee and provider-collected add-ons. Tender/liability/
  -- discount reversals are parallel representations and are excluded here.
  v_sum_parts := v_r_pe + v_r_tip + v_r_travel + v_r_pf + v_r_comm + v_r_cancel
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.create_finance_ledger_from_booking_refund() IS
  'F5: proportional reversals by component. Cash economics (provider_earnings/tip/travel/platform_fee/tax/payment commission/cancellation_fee/walk_in_additional_charge/additional_charge_payment) are penny-balanced to -refund_amount. '
  'Tender/liability/discount rows (promotion_discount/membership_discount/loyalty_redemption/wallet_payment/gift_card_payment/gift_card_liability_reduction) are reversed as transaction_type=refund tagged by refund_component; provider-facing consumers attribute via lib/ledger/refund-components. '
  'F6: completed->failed deletes posted rows. Legacy bookings with no recognition fall back to single _legacy row. '
  '652: tenant_id resolved with provider/default fallback. 654: full component reversal.';
