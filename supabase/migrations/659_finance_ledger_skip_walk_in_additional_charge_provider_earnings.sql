-- 659: stop double-counting walk-in mid-visit additional charges in recognized revenue
--
-- Root cause (money-correctness QA, Option A — guard the trigger):
-- `record_walk_in_additional_charge_payment` (migration 580) settles a walk-in
-- additional charge by BOTH (a) inserting a `booking_payments` row — which fires this
-- trigger, `create_finance_ledger_from_payment()`, producing a `provider_earnings`
-- ledger row — AND (b) inserting a `walk_in_additional_charge` ledger row for the same
-- amount. `recognizedRevenue()` / `computeDashboardEarningsMix()` sum BOTH
-- `provider_earnings` and `walk_in_additional_charge`, so the charge is recognized ~2x
-- (recognized revenue, earnings mix, payments/summary providerNetActivity, payouts-report
-- service earnings).
--
-- Fix: redefine `create_finance_ledger_from_payment()` with its 656 behavior preserved
-- EXACTLY, plus a narrow guard that SKIPS only the `provider_earnings` insert when the
-- triggering `booking_payments` row is a walk-in additional charge. The
-- `walk_in_additional_charge` row from migration 580 stays the single source of
-- recognition for these charges, so payout semantics are unchanged (the cash
-- `provider_earnings` was already excluded from payout via excludeProviderCollected, and
-- `walk_in_additional_charge` is recognition-only / never payoutable).
--
-- Marker: migration 580 is the ONLY booking_payments writer that tags the row with
--   payment_provider_data ->> 'source' = 'walk_in'   (verified by repo-wide search)
-- and it always also sets payment_provider_data ->> 'additional_charge_id'. We match on
-- BOTH (structured JSON, not the free-text `notes`) so the guard is specific to exactly
-- this path. Every other payment path (online paystack — already short-circuited above —,
-- wallet, gift card, normal cash base-service, etc.) leaves
-- payment_provider_data->>'source' as something else (or null) and is therefore
-- completely unaffected: it continues to produce identical ledger rows.
--
-- Only the `provider_earnings` insert is skipped for the matched rows. The optional
-- platform-commission `payment` row and the per-booking-items block (platform_fee, tip,
-- tax, travel_fee, discount contras) are intentionally left untouched — the items block
-- is already guarded by the existing per-booking `v_has_existing_booking_items` check, so
-- on the walk-in add-on payment (which fires after the base booking already posted its
-- items) it is a no-op exactly as before. This function never updates payment_status
-- (that is a separate trigger), so no other side effects are affected.

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
    -- 659: true when this booking_payments row is a walk-in mid-visit additional charge
    -- (migration 580). Its recognition is owned by the sibling walk_in_additional_charge
    -- ledger row, so we must NOT also post a provider_earnings row for it.
    v_is_walk_in_additional_charge BOOLEAN;
BEGIN
    IF NEW.status != 'completed' THEN
        RETURN NEW;
    END IF;

    IF NEW.payment_provider = 'paystack' THEN
        RETURN NEW;
    END IF;

    IF EXISTS (SELECT 1 FROM public.finance_transactions ft WHERE ft.source_payment_id = NEW.id) THEN
        RETURN NEW;
    END IF;

    -- F1: wallet/gift synthetic legs must not double-ledger when Paystack (or no-gateway) already wrote `payment`.
    IF NEW.payment_provider IN ('wallet', 'gift_card') THEN
        IF EXISTS (
            SELECT 1 FROM public.finance_transactions ft
            WHERE ft.booking_id = NEW.booking_id
              AND ft.transaction_type = 'payment'
        ) THEN
            RETURN NEW;
        END IF;
    END IF;

    -- 659: detect the walk-in additional-charge settlement row (migration 580). Match on
    -- the structured payment_provider_data markers it always sets, not the free-text notes.
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

    -- 659: skip provider_earnings ONLY for walk-in additional charges. Their recognition is
    -- owned by the walk_in_additional_charge ledger row written in migration 580; posting a
    -- provider_earnings row here would double-count the same money in recognized revenue.
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
  'Non-Paystack booking_payments ledger. F1 skips wallet/gift when a Paystack payment row exists. '
  'Commission base matches Paystack. commission_enabled + tenant-scoped settings + provider override. '
  'Tax net=0. promotion_discount/membership_discount/loyalty_redemption contra rows when present (656). '
  '659: skips the provider_earnings row for walk-in additional-charge settlements '
  '(payment_provider_data->>source = walk_in) — recognized once via the walk_in_additional_charge row.';
