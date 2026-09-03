-- =============================================================================
-- Guarded repair: missing first-charge finance ledger for online gateways only.
--
-- Run scripts/diagnose-missing-online-charge-ledger.sql first and review it.
-- This script only touches rows the diagnose query flags safe_to_auto_backfill:
--   * paystack / stripe / flutterwave, status = completed
--   * full payment (no deposit / split), amount ~ total_amount - paid add-ons
--   * booking not cancelled / no_show, no booking_refunds
--   * no existing `payment` row lacking source_payment_id (predates attribution)
--   * no `payment` row already attributed to this booking_payments.id
--
-- Legs mirror apps/web/src/lib/bookings/record-booking-online-charge-ledger.ts:
--   payment          amount = commission base, fees = gateway fee, commission, net = commission
--   provider_earnings amount = base - commission, net = same
--   platform_fee      net = amount        (when > 0)
--   tip               net = amount        (when > 0)
--   tax               net = 0             (when > 0)
--   travel_fee        net = amount        (when > 0)
--
-- Commission mirrors apps/web/src/lib/finance/resolve-commission-percentage.ts:
--   platform_settings.settings->'payouts' (commission_enabled, platform_commission_percentage)
--   for the booking's tenant, then providers.commission_override when set.
--
-- created_at = booking_payments.created_at so period reports land on the real day.
-- Idempotent via NOT EXISTS guards. RAISE EXCEPTION on any leg-sum or GL imbalance
-- so the whole DO block rolls back.
-- =============================================================================

DO $$
DECLARE
  v_row RECORD;
  v_tenant_id UUID;
  v_currency TEXT;
  v_payouts JSONB;
  v_commission_enabled BOOLEAN;
  v_platform_pct NUMERIC;
  v_override_pct NUMERIC;
  v_commission_pct NUMERIC;
  v_commission_base NUMERIC;
  v_platform_commission NUMERIC;
  v_provider_earnings NUMERIC;
  v_tip NUMERIC;
  v_tax NUMERIC;
  v_travel NUMERIC;
  v_platform_fee NUMERIC;
  v_leg_sum NUMERIC;
  v_journal_debits NUMERIC;
  v_journal_credits NUMERIC;
  v_journal_entries INT;
  v_repaired INT := 0;
BEGIN
  FOR v_row IN
    WITH paid_addons AS (
      SELECT ac.booking_id, COALESCE(SUM(ac.amount) FILTER (WHERE ac.status = 'paid'), 0) AS paid_addon_total
      FROM public.additional_charges ac
      GROUP BY ac.booking_id
    ),
    candidates AS (
      SELECT
        bp.id AS booking_payment_id,
        bp.booking_id,
        bp.amount,
        bp.payment_provider,
        bp.payment_provider_id,
        bp.created_at,
        b.booking_number,
        b.provider_id,
        COALESCE(b.tenant_id, p.tenant_id) AS tenant_id,
        COALESCE(NULLIF(TRIM(b.currency), ''), 'ZAR') AS currency,
        b.status AS booking_status,
        b.total_amount,
        b.tip_amount,
        b.tax_amount,
        b.travel_fee,
        COALESCE(NULLIF(b.platform_fee_amount, 0), NULLIF(b.service_fee_amount, 0), NULLIF(b.platform_service_fee, 0), 0) AS platform_fee,
        (b.total_amount - COALESCE(pa.paid_addon_total, 0)) AS original_checkout_total
      FROM public.booking_payments bp
      JOIN public.bookings b ON b.id = bp.booking_id
      LEFT JOIN public.providers p ON p.id = b.provider_id
      LEFT JOIN paid_addons pa ON pa.booking_id = bp.booking_id
      WHERE bp.status = 'completed'
        AND bp.payment_provider IN ('paystack', 'stripe', 'flutterwave')
        AND b.status NOT IN ('cancelled', 'no_show')
        AND NOT EXISTS (SELECT 1 FROM public.booking_refunds br WHERE br.booking_id = bp.booking_id)
        AND NOT EXISTS (
          SELECT 1 FROM public.finance_transactions ft
          WHERE ft.booking_id = bp.booking_id
            AND ft.transaction_type = 'payment'
            AND ft.source_payment_id IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.finance_transactions ft
          WHERE ft.booking_id = bp.booking_id
            AND ft.transaction_type = 'payment'
            AND ft.source_payment_id = bp.id
        )
        AND ABS(bp.amount - (b.total_amount - COALESCE(pa.paid_addon_total, 0))) < 0.02
        AND COALESCE((bp.payment_provider_data->>'requires_deposit')::boolean, false) = false
        AND COALESCE(bp.payment_provider_data->>'payment_option', b.payment_option, 'full') = 'full'
    )
    SELECT * FROM candidates
    ORDER BY created_at ASC
  LOOP
    v_tenant_id := v_row.tenant_id;
    v_currency := v_row.currency;
    v_tip := COALESCE(v_row.tip_amount, 0);
    v_tax := COALESCE(v_row.tax_amount, 0);
    v_travel := COALESCE(v_row.travel_fee, 0);
    v_platform_fee := COALESCE(v_row.platform_fee, 0);

    -- ── Commission: platform_settings.settings->'payouts', then providers.commission_override ──
    -- Mirrors resolveCommissionPercentageForProvider: commission is OFF unless
    -- commission_enabled = true; the override only applies when commission is enabled.
    SELECT ps.settings->'payouts'
    INTO v_payouts
    FROM public.platform_settings ps
    WHERE ps.is_active = true
      AND (v_tenant_id IS NULL OR ps.tenant_id = v_tenant_id)
    ORDER BY ps.created_at DESC
    LIMIT 1;

    v_commission_enabled := COALESCE((v_payouts->>'commission_enabled')::boolean, false);
    v_platform_pct := COALESCE((v_payouts->>'platform_commission_percentage')::numeric, 0);

    IF NOT v_commission_enabled THEN
      v_commission_pct := 0;
    ELSE
      SELECT p.commission_override INTO v_override_pct
      FROM public.providers p
      WHERE p.id = v_row.provider_id;
      v_commission_pct := COALESCE(v_override_pct, v_platform_pct);
    END IF;

    v_commission_base := GREATEST(0, v_row.amount - v_tip - v_tax - v_travel - v_platform_fee);
    v_platform_commission := ROUND(v_commission_base * v_commission_pct / 100.0, 2);
    v_provider_earnings := ROUND(v_commission_base - v_platform_commission, 2);

    -- ── Assert: legs must sum to the captured amount ──
    v_leg_sum := v_commission_base + v_tip + v_tax + v_travel + v_platform_fee;
    IF ABS(v_leg_sum - v_row.amount) > 0.05 THEN
      RAISE EXCEPTION 'Leg sum mismatch booking % payment %: legs % vs amount %',
        v_row.booking_id, v_row.booking_payment_id, v_leg_sum, v_row.amount;
    END IF;
    IF ABS((v_platform_commission + v_provider_earnings) - v_commission_base) > 0.01 THEN
      RAISE EXCEPTION 'Commission split mismatch booking % payment %: % + % vs base %',
        v_row.booking_id, v_row.booking_payment_id, v_platform_commission, v_provider_earnings, v_commission_base;
    END IF;

    -- ── payment leg (fees left at 0; see fee patch section below and the reconcile cron) ──
    INSERT INTO public.finance_transactions (
      booking_id, provider_id, tenant_id, transaction_type, amount, fees, commission, net,
      description, source_payment_id, currency, created_at
    )
    SELECT v_row.booking_id, v_row.provider_id, v_tenant_id, 'payment', v_commission_base, 0,
      v_platform_commission, v_platform_commission,
      'Payment for booking ' || v_row.booking_number, v_row.booking_payment_id, v_currency, v_row.created_at
    WHERE NOT EXISTS (
      SELECT 1 FROM public.finance_transactions ft
      WHERE ft.booking_id = v_row.booking_id AND ft.transaction_type = 'payment' AND ft.source_payment_id = v_row.booking_payment_id
    );

    -- ── provider_earnings leg ──
    INSERT INTO public.finance_transactions (
      booking_id, provider_id, tenant_id, transaction_type, amount, fees, commission, net,
      description, source_payment_id, currency, created_at
    )
    SELECT v_row.booking_id, v_row.provider_id, v_tenant_id, 'provider_earnings', v_provider_earnings, 0, 0,
      v_provider_earnings, 'Provider earnings for booking ' || v_row.booking_number,
      v_row.booking_payment_id, v_currency, v_row.created_at
    WHERE NOT EXISTS (
      SELECT 1 FROM public.finance_transactions ft
      WHERE ft.booking_id = v_row.booking_id AND ft.transaction_type = 'provider_earnings' AND ft.source_payment_id = v_row.booking_payment_id
    );

    -- ── booking-level legs (full payment: never deferred) ──
    IF v_platform_fee > 0 AND NOT EXISTS (
      SELECT 1 FROM public.finance_transactions ft
      WHERE ft.booking_id = v_row.booking_id AND ft.transaction_type IN ('platform_fee', 'service_fee')
    ) THEN
      INSERT INTO public.finance_transactions (
        booking_id, provider_id, tenant_id, transaction_type, amount, fees, commission, net,
        description, source_payment_id, currency, created_at
      ) VALUES (
        v_row.booking_id, v_row.provider_id, v_tenant_id, 'platform_fee', v_platform_fee, 0, 0, v_platform_fee,
        'Platform fee for booking ' || v_row.booking_number, v_row.booking_payment_id, v_currency, v_row.created_at
      );
    END IF;

    IF v_tip > 0 AND NOT EXISTS (
      SELECT 1 FROM public.finance_transactions ft WHERE ft.booking_id = v_row.booking_id AND ft.transaction_type = 'tip'
    ) THEN
      INSERT INTO public.finance_transactions (
        booking_id, provider_id, tenant_id, transaction_type, amount, fees, commission, net,
        description, source_payment_id, currency, created_at
      ) VALUES (
        v_row.booking_id, v_row.provider_id, v_tenant_id, 'tip', v_tip, 0, 0, v_tip,
        'Tip for booking ' || v_row.booking_number, v_row.booking_payment_id, v_currency, v_row.created_at
      );
    END IF;

    -- tax: net = 0 (pass-through liability, matches the helper)
    IF v_tax > 0 AND NOT EXISTS (
      SELECT 1 FROM public.finance_transactions ft WHERE ft.booking_id = v_row.booking_id AND ft.transaction_type = 'tax'
    ) THEN
      INSERT INTO public.finance_transactions (
        booking_id, provider_id, tenant_id, transaction_type, amount, fees, commission, net,
        description, source_payment_id, currency, created_at
      ) VALUES (
        v_row.booking_id, v_row.provider_id, v_tenant_id, 'tax', v_tax, 0, 0, 0,
        'Tax for booking ' || v_row.booking_number, v_row.booking_payment_id, v_currency, v_row.created_at
      );
    END IF;

    IF v_travel > 0 AND NOT EXISTS (
      SELECT 1 FROM public.finance_transactions ft WHERE ft.booking_id = v_row.booking_id AND ft.transaction_type = 'travel_fee'
    ) THEN
      INSERT INTO public.finance_transactions (
        booking_id, provider_id, tenant_id, transaction_type, amount, fees, commission, net,
        description, source_payment_id, currency, created_at
      ) VALUES (
        v_row.booking_id, v_row.provider_id, v_tenant_id, 'travel_fee', v_travel, 0, 0, v_travel,
        'Travel fee for booking ' || v_row.booking_number, v_row.booking_payment_id, v_currency, v_row.created_at
      );
    END IF;

    -- ── Post-insert assert: single-entry legs attributed to this payment sum to amount ──
    SELECT COALESCE(SUM(ft.amount), 0)
    INTO v_leg_sum
    FROM public.finance_transactions ft
    WHERE ft.booking_id = v_row.booking_id
      AND ft.source_payment_id = v_row.booking_payment_id
      AND ft.transaction_type IN ('payment', 'platform_fee', 'tip', 'tax', 'travel_fee');
    IF ABS(v_leg_sum - v_row.amount) > 0.05 THEN
      RAISE EXCEPTION 'Posted leg sum mismatch booking % payment %: posted % vs amount %',
        v_row.booking_id, v_row.booking_payment_id, v_leg_sum, v_row.amount;
    END IF;

    -- ── GL shadow journal balance (migration 495 tables; trigger shadow_post_finance_transaction) ──
    -- journal_entries.payment_id is the booking_payments.id (source_payment_id). If the shadow
    -- trigger produced entries for this payment, debits must equal credits.
    SELECT
      COUNT(DISTINCT je.id),
      COALESCE(SUM(jl.reporting_amount) FILTER (WHERE jl.side = 'debit'), 0),
      COALESCE(SUM(jl.reporting_amount) FILTER (WHERE jl.side = 'credit'), 0)
    INTO v_journal_entries, v_journal_debits, v_journal_credits
    FROM public.journal_entries je
    LEFT JOIN public.journal_lines jl ON jl.entry_id = je.id
    WHERE je.payment_id = v_row.booking_payment_id;

    IF v_journal_entries > 0 AND ABS(v_journal_debits - v_journal_credits) > 0.01 THEN
      RAISE EXCEPTION 'GL journal imbalance booking % payment %: debits % vs credits % across % entries',
        v_row.booking_id, v_row.booking_payment_id, v_journal_debits, v_journal_credits, v_journal_entries;
    END IF;
    IF v_journal_entries = 0 THEN
      RAISE NOTICE 'No shadow journal entries for payment % (shadow trigger disabled or type not mapped)', v_row.booking_payment_id;
    END IF;

    v_repaired := v_repaired + 1;
    RAISE NOTICE 'Repaired % (%): base % commission_pct % -> commission % earnings % | tip % tax % travel % platform_fee %',
      v_row.booking_number, v_row.payment_provider, v_commission_base, v_commission_pct,
      v_platform_commission, v_provider_earnings, v_tip, v_tax, v_travel, v_platform_fee;
  END LOOP;

  RAISE NOTICE 'Repaired % booking payment ledger gaps', v_repaired;
END $$;

-- =============================================================================
-- Fee patch: BTN-20260902-133730-540BED64 (R208 Paystack saved-card charge).
--
-- The booking was manually backfilled with fees = 0. Paystack transaction 6518600061
-- (reference booking_42c4bb43-..._1788356251491) carries the real gateway fee.
-- Fallback when the reconcile cron cannot verify with Paystack: read the fee that
-- the checkout stored in payments.payment_provider_response->'data'->>'fees' (cents)
-- and patch it onto payment_transactions and the attributed finance_transactions
-- `payment` leg. If no fee is stored, leave 0 and let the cron's fee-patch pass
-- (metadata.fee_source = 'manual_backfill') pick it up from transaction/verify.
-- =============================================================================

DO $$
DECLARE
  v_booking_number TEXT := 'BTN-20260902-133730-540BED64';
  v_paystack_txn_id TEXT := '6518600061';
  v_booking_id UUID;
  v_booking_payment_id UUID;
  v_reference TEXT;
  v_fees_cents NUMERIC;
  v_fees_major NUMERIC;
  v_pt_amount NUMERIC;
  v_updated INT;
BEGIN
  SELECT b.id INTO v_booking_id
  FROM public.bookings b
  WHERE b.booking_number = v_booking_number;

  IF v_booking_id IS NULL THEN
    RAISE NOTICE 'Fee patch: booking % not found in this database — skipping', v_booking_number;
    RETURN;
  END IF;

  SELECT bp.id, bp.payment_provider_id
  INTO v_booking_payment_id, v_reference
  FROM public.booking_payments bp
  WHERE bp.booking_id = v_booking_id
    AND bp.payment_provider = 'paystack'
    AND bp.status = 'completed'
    AND bp.payment_provider_id LIKE 'booking\_42c4bb43-%\_1788356251491'
  ORDER BY bp.created_at ASC
  LIMIT 1;

  IF v_booking_payment_id IS NULL THEN
    -- Fall back to the only completed Paystack booking_payments row on this booking.
    SELECT bp.id, bp.payment_provider_id
    INTO v_booking_payment_id, v_reference
    FROM public.booking_payments bp
    WHERE bp.booking_id = v_booking_id
      AND bp.payment_provider = 'paystack'
      AND bp.status = 'completed'
    ORDER BY bp.created_at ASC
    LIMIT 1;
  END IF;

  IF v_booking_payment_id IS NULL OR v_reference IS NULL THEN
    RAISE NOTICE 'Fee patch: no completed Paystack booking_payments row for % — skipping', v_booking_number;
    RETURN;
  END IF;

  -- Paystack fee in cents, as stored by the checkout in payments.payment_provider_response.
  SELECT NULLIF(p.payment_provider_response->'data'->>'fees', '')::numeric
  INTO v_fees_cents
  FROM public.payments p
  WHERE p.booking_id = v_booking_id
    AND (
      p.payment_provider_transaction_id = v_reference
      OR p.payment_provider_transaction_id = v_paystack_txn_id
      OR p.payment_provider_response->'data'->>'reference' = v_reference
      OR (p.payment_provider_response->'data'->>'id') = v_paystack_txn_id
    )
    AND NULLIF(p.payment_provider_response->'data'->>'fees', '') IS NOT NULL
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF v_fees_cents IS NULL OR v_fees_cents <= 0 THEN
    -- Not stored locally. Leave fees = 0; the reconcile cron fee-patch pass verifies
    -- reference % against Paystack (txn 6518600061) and patches it automatically.
    RAISE NOTICE 'Fee patch: no stored Paystack fee for % (ref %, txn %) — leaving fees = 0 for the cron to patch',
      v_booking_number, v_reference, v_paystack_txn_id;
    RETURN;
  END IF;

  v_fees_major := ROUND(v_fees_cents / 100.0, 2);

  SELECT pt.amount INTO v_pt_amount
  FROM public.payment_transactions pt
  WHERE pt.provider = 'paystack' AND pt.reference = v_reference
  LIMIT 1;

  UPDATE public.payment_transactions pt
  SET fees = v_fees_major,
      net_amount = ROUND(COALESCE(v_pt_amount, pt.amount) - v_fees_major, 2),
      metadata = COALESCE(pt.metadata, '{}'::jsonb)
        || jsonb_build_object(
             'fee_source', 'payments_response_backfill',
             'fee_source_before_patch', pt.metadata->>'fee_source',
             'fee_patched_at', NOW(),
             'paystack_transaction_id', v_paystack_txn_id
           )
  WHERE pt.provider = 'paystack'
    AND pt.reference = v_reference
    AND COALESCE(pt.fees, 0) = 0;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'Fee patch: payment_transactions rows updated: % (fees %)', v_updated, v_fees_major;

  -- `net` on the payment leg is the platform commission and does not move with gateway fees.
  UPDATE public.finance_transactions ft
  SET fees = v_fees_major
  WHERE ft.booking_id = v_booking_id
    AND ft.transaction_type = 'payment'
    AND ft.source_payment_id = v_booking_payment_id
    AND COALESCE(ft.fees, 0) = 0;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'Fee patch: finance_transactions payment rows updated: %', v_updated;
END $$;
