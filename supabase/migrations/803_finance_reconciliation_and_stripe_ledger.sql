-- 803: finance reconciliation + Stripe/Flutterwave ledger routing
--
-- 1. ledger_reconciliation_summary: exclude intentionally unshadowed types
--    (provider_earnings, gift_card_liability_reduction per migration 734) from
--    legacy_row_count so missing_row_count is not inflated.
-- 2. create_finance_ledger_from_payment: Stripe/Flutterwave early-return (webhook
--    owns ledger like Paystack); extend platform-held tenders for commission.
-- 3. Backfill misclassified card-machine tips (800 predates some historical rows).

-- ─── Reconciliation summary ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ledger_reconciliation_summary(
  p_from timestamptz DEFAULT '-infinity'::timestamptz,
  p_to   timestamptz DEFAULT 'infinity'::timestamptz
)
RETURNS TABLE (
  legacy_row_count       bigint,
  shadowed_row_count     bigint,
  missing_row_count      bigint,
  imbalanced_entry_count bigint,
  legacy_sum_abs         numeric,
  ledger_sum_debits      numeric,
  ledger_sum_credits     numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH legacy AS (
    SELECT COUNT(*)                       AS total_rows,
           COALESCE(SUM(ABS(amount)), 0)::numeric AS sum_abs
    FROM public.finance_transactions ft
    WHERE COALESCE(ft.created_at, '-infinity'::timestamptz) >= p_from
      AND COALESCE(ft.created_at, 'infinity'::timestamptz)   < p_to
      AND ft.transaction_type NOT IN ('provider_earnings', 'gift_card_liability_reduction')
  ),
  shadowed AS (
    SELECT COUNT(*) AS total_rows
    FROM public.finance_transactions ft
    JOIN public.journal_entries je
      ON je.source = 'finance_transactions'
     AND je.external_ref = ft.id::text
    WHERE COALESCE(ft.created_at, '-infinity'::timestamptz) >= p_from
      AND COALESCE(ft.created_at, 'infinity'::timestamptz)   < p_to
  ),
  entries_in_window AS (
    SELECT je.id
    FROM public.journal_entries je
    WHERE je.posted_at >= p_from AND je.posted_at < p_to
  ),
  entry_totals AS (
    SELECT e.id,
           COALESCE(SUM(jl.reporting_amount) FILTER (WHERE jl.side = 'debit'),  0) AS debits,
           COALESCE(SUM(jl.reporting_amount) FILTER (WHERE jl.side = 'credit'), 0) AS credits
    FROM entries_in_window e
    LEFT JOIN public.journal_lines jl ON jl.entry_id = e.id
    GROUP BY e.id
  ),
  totals AS (
    SELECT
      COUNT(*) FILTER (WHERE debits <> credits) AS imbalanced,
      COALESCE(SUM(debits),  0)::numeric        AS total_debits,
      COALESCE(SUM(credits), 0)::numeric        AS total_credits
    FROM entry_totals
  )
  SELECT
    legacy.total_rows,
    shadowed.total_rows,
    GREATEST(legacy.total_rows - shadowed.total_rows, 0),
    totals.imbalanced,
    legacy.sum_abs,
    totals.total_debits,
    totals.total_credits
  FROM legacy, shadowed, totals;
$$;

GRANT EXECUTE ON FUNCTION public.ledger_reconciliation_summary(timestamptz, timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.ledger_reconciliation_summary IS
  'F14 Phase 3: reconciliation between finance_transactions and journal_entries. '
  'legacy_row_count excludes provider_earnings and gift_card_liability_reduction (734 no-GL types).';

-- ─── create_finance_ledger_from_payment (800 body + Stripe/Flutterwave) ─────

CREATE OR REPLACE FUNCTION public.create_finance_ledger_from_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_booking RECORD;
    v_tenant_id UUID;
    v_platform_commission_rate NUMERIC(5, 4);
    v_commission_enabled BOOLEAN;
    v_provider_override NUMERIC(5, 2);
    v_commission_base NUMERIC(10, 2);
    v_platform_commission NUMERIC(10, 2);
    v_provider_earnings NUMERIC(10, 2);
    v_is_online_booking BOOLEAN;
    v_payment_amount NUMERIC(10, 2);
    v_total_amount NUMERIC(10, 2);
    v_net_ratio NUMERIC(10, 6);
    v_has_existing_booking_items BOOLEAN;
    v_pf NUMERIC(10, 2);
    v_is_walk_in_additional_charge BOOLEAN;
    v_is_platform_held BOOLEAN;
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

    v_commission_enabled := NULL;
    v_platform_commission_rate := NULL;

    SELECT
        COALESCE((s.settings->'payouts'->>'commission_enabled')::BOOLEAN, false),
        COALESCE((s.settings->'payouts'->>'platform_commission_percentage')::NUMERIC / 100, 0)
    INTO v_commission_enabled, v_platform_commission_rate
    FROM public.platform_settings s
    WHERE s.is_active = true
      AND s.tenant_id = v_tenant_id
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        SELECT
            COALESCE((s.settings->'payouts'->>'commission_enabled')::BOOLEAN, false),
            COALESCE((s.settings->'payouts'->>'platform_commission_percentage')::NUMERIC / 100, 0)
        INTO v_commission_enabled, v_platform_commission_rate
        FROM public.platform_settings s
        WHERE s.is_active = true
          AND s.tenant_id IS NULL
        ORDER BY s.created_at DESC
        LIMIT 1;
    END IF;

    IF v_commission_enabled IS NULL THEN
        v_commission_enabled := false;
    END IF;
    IF v_platform_commission_rate IS NULL THEN
        v_platform_commission_rate := 0;
    END IF;

    IF NOT v_commission_enabled THEN
        v_platform_commission_rate := 0;
    ELSE
        BEGIN
            SELECT p.commission_override
            INTO v_provider_override
            FROM public.providers p
            WHERE p.id = v_booking.provider_id;
            IF v_provider_override IS NOT NULL THEN
                v_platform_commission_rate := v_provider_override / 100;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    v_is_platform_held := (NEW.payment_provider IN ('wallet', 'gift_card', 'stripe', 'flutterwave'));
    IF NOT v_is_platform_held THEN
        v_platform_commission_rate := 0;
    END IF;

    v_is_online_booking := (v_booking.booking_source = 'online');
    v_payment_amount := NEW.amount;
    v_total_amount := GREATEST(v_booking.total_amount, 0.01);
    v_pf := COALESCE(v_booking.platform_fee_amount, 0);

    v_net_ratio := GREATEST(
        0,
        (v_total_amount - v_pf - v_booking.tax_amount - v_booking.travel_fee - v_booking.tip_amount)
    ) / v_total_amount;

    v_commission_base := ROUND(v_payment_amount * v_net_ratio, 2);
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

    v_has_existing_booking_items := EXISTS (
        SELECT 1 FROM public.finance_transactions ft
        WHERE ft.booking_id = NEW.booking_id
          AND ft.transaction_type IN ('tip', 'tax', 'travel_fee', 'platform_fee', 'service_fee', 'promotion_discount', 'membership_discount', 'loyalty_redemption')
    );

    IF NOT v_has_existing_booking_items THEN
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
                transaction_type, amount, fees, commission, net, description, created_at
            ) VALUES (
                v_tenant_id, NEW.booking_id, v_booking.provider_id, NEW.id,
                'tax', v_booking.tax_amount, 0, 0, 0,
                'Tax (VAT) for booking ' || v_booking.booking_number || ' - Provider must remit to SARS',
                NOW()
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
        RAISE WARNING 'Error creating finance transactions for booking %: %', NEW.booking_id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.create_finance_ledger_from_payment() IS
  'Non-gateway booking_payments ledger. Paystack/Stripe/Flutterwave return early (webhook owns ledger). '
  'F1 skips wallet/gift when a gateway payment row exists. '
  '662/803: commission on platform-held tenders (wallet/gift_card/stripe/flutterwave). '
  '800: card-machine tips (payment_provider_data->>tip = true) post tip not provider_earnings.';

-- ─── Backfill misclassified card-machine tips ─────────────────────────────────
-- Pre-800 rows went down the generic path, so their description reads
-- 'Provider earnings for booking …'. The reliable signal is the source payment
-- row being a pure-gratuity tender (payment_provider_data->>'tip' = 'true').

UPDATE public.finance_transactions ft
SET transaction_type = 'tip',
    description = REPLACE(ft.description, 'Provider earnings', 'Card machine tip')
WHERE ft.transaction_type = 'provider_earnings'
  AND ft.source_payment_id IN (
    SELECT bp.id FROM public.booking_payments bp
    WHERE bp.payment_provider_data->>'tip' = 'true'
  );
