-- ============================================================================
-- Migration 481: Respect commission_enabled flag in finance ledger trigger
-- ============================================================================
-- Fix: The create_finance_ledger_from_payment trigger always read the
-- platform_commission_percentage and applied it (with a 15% fallback) for
-- online bookings, ignoring the commission_enabled flag.
-- The TS code (resolveCommissionPercentageForProvider) correctly checks
-- commission_enabled === true first and returns 0 when disabled.
-- This migration aligns the trigger with the TS behavior.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_finance_ledger_from_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_booking RECORD;
    v_tenant_id UUID;
    v_platform_commission_rate NUMERIC(5, 4);
    v_commission_base NUMERIC(10, 2);
    v_platform_commission NUMERIC(10, 2);
    v_provider_earnings NUMERIC(10, 2);
    v_is_online_booking BOOLEAN;
    v_payment_amount NUMERIC(10, 2);
    v_total_amount NUMERIC(10, 2);
    v_net_ratio NUMERIC(10, 6);
    v_has_existing_booking_items BOOLEAN;
    v_commission_enabled BOOLEAN;
    v_provider_commission_override NUMERIC;
BEGIN
    -- Only process completed payments
    IF NEW.status != 'completed' THEN
        RETURN NEW;
    END IF;

    -- Paystack payments are handled by the webhook/verify app-level code.
    -- The trigger should not create duplicate ledger entries for those.
    IF NEW.payment_provider = 'paystack' THEN
        RETURN NEW;
    END IF;

    -- Per-payment idempotency: skip if ledger entries already exist for this payment
    IF EXISTS (
        SELECT 1 FROM public.finance_transactions ft
        WHERE ft.source_payment_id = NEW.id
    ) THEN
        RETURN NEW;
    END IF;

    -- Load booking details
    SELECT
        b.id,
        b.booking_number,
        b.provider_id,
        b.tenant_id,
        b.total_amount,
        COALESCE(b.service_fee_amount, 0) AS service_fee_amount,
        COALESCE(b.tip_amount, 0) AS tip_amount,
        COALESCE(b.tax_amount, 0) AS tax_amount,
        COALESCE(b.travel_fee, 0) AS travel_fee,
        COALESCE(b.booking_source, 'online') AS booking_source
    INTO v_booking
    FROM public.bookings b
    WHERE b.id = NEW.booking_id;

    IF NOT FOUND THEN
        RAISE WARNING 'Booking not found for payment: %', NEW.booking_id;
        RETURN NEW;
    END IF;

    -- Resolve tenant_id
    v_tenant_id := COALESCE(
        v_booking.tenant_id,
        (SELECT p.tenant_id FROM public.providers p WHERE p.id = v_booking.provider_id),
        public.tenant_default_za_id()
    );

    -- Read commission settings from platform_settings
    -- Respect commission_enabled flag (same as resolveCommissionPercentageForProvider in TS)
    BEGIN
        SELECT
            COALESCE((s.settings->'payouts'->>'commission_enabled')::BOOLEAN, false),
            COALESCE(
                (s.settings->'payouts'->>'platform_commission_percentage')::NUMERIC / 100,
                0
            )
        INTO v_commission_enabled, v_platform_commission_rate
        FROM public.platform_settings s
        WHERE s.is_active = true
        ORDER BY s.created_at DESC
        LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        v_commission_enabled := false;
        v_platform_commission_rate := 0;
    END;

    IF v_commission_enabled IS NULL THEN
        v_commission_enabled := false;
    END IF;
    IF v_platform_commission_rate IS NULL THEN
        v_platform_commission_rate := 0;
    END IF;

    -- When commission is disabled, rate is 0 (no platform take)
    IF NOT v_commission_enabled THEN
        v_platform_commission_rate := 0;
    ELSE
        -- Check for provider-level commission override
        BEGIN
            SELECT p.commission_override
            INTO v_provider_commission_override
            FROM public.providers p
            WHERE p.id = v_booking.provider_id;

            IF v_provider_commission_override IS NOT NULL THEN
                v_platform_commission_rate := v_provider_commission_override / 100;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Keep platform default rate
        END;
    END IF;

    -- Commission only applies to online bookings (platform-facilitated)
    -- 'walk_in' and 'provider' bookings are direct-collection — no platform fee
    v_is_online_booking := (v_booking.booking_source = 'online');

    -- Proportional calculation based on actual payment amount
    v_payment_amount := NEW.amount;
    v_total_amount := GREATEST(v_booking.total_amount, 0.01);

    IF v_is_online_booking THEN
        -- For online: commission_base excludes service_fee, tax, travel (proportional)
        v_net_ratio := GREATEST(0, (v_total_amount - v_booking.service_fee_amount - v_booking.tax_amount - v_booking.travel_fee))
                       / v_total_amount;
        v_commission_base := ROUND(v_payment_amount * v_net_ratio, 2);
        v_platform_commission := ROUND(v_commission_base * v_platform_commission_rate, 2);
        v_provider_earnings := v_commission_base - v_platform_commission;
    ELSE
        -- Walk-in / provider: no platform commission. Provider keeps 100%.
        v_net_ratio := GREATEST(0, (v_total_amount - v_booking.tax_amount - v_booking.travel_fee))
                       / v_total_amount;
        v_commission_base := ROUND(v_payment_amount * v_net_ratio, 2);
        v_platform_commission := 0;
        v_provider_earnings := v_commission_base;
    END IF;

    -- 1. Platform commission (payment type) — online only, when commission > 0
    IF v_is_online_booking AND v_platform_commission > 0 THEN
        INSERT INTO public.finance_transactions (
            tenant_id, booking_id, provider_id, source_payment_id,
            transaction_type, amount, fees, commission, net,
            description, created_at
        ) VALUES (
            v_tenant_id, NEW.booking_id, v_booking.provider_id, NEW.id,
            'payment', v_commission_base, 0, v_platform_commission, v_platform_commission,
            'Payment for booking ' || v_booking.booking_number || ' (via ' || NEW.payment_method || ')',
            NOW()
        );
    END IF;

    -- 2. Provider earnings
    INSERT INTO public.finance_transactions (
        tenant_id, booking_id, provider_id, source_payment_id,
        transaction_type, amount, fees, commission, net,
        description, created_at
    ) VALUES (
        v_tenant_id, NEW.booking_id, v_booking.provider_id, NEW.id,
        'provider_earnings', v_provider_earnings, 0, 0, v_provider_earnings,
        'Provider earnings for booking ' || v_booking.booking_number
            || ' (via ' || NEW.payment_method || ', source: ' || v_booking.booking_source || ')',
        NOW()
    );

    -- Booking-level items: only create once per booking (not per payment)
    v_has_existing_booking_items := EXISTS (
        SELECT 1 FROM public.finance_transactions ft
        WHERE ft.booking_id = NEW.booking_id
          AND ft.transaction_type IN ('tip', 'tax', 'travel_fee', 'service_fee')
    );

    IF NOT v_has_existing_booking_items THEN
        -- 3. Service fee (online only)
        IF v_is_online_booking AND v_booking.service_fee_amount > 0 THEN
            INSERT INTO public.finance_transactions (
                tenant_id, booking_id, provider_id, source_payment_id,
                transaction_type, amount, fees, commission, net,
                description, created_at
            ) VALUES (
                v_tenant_id, NEW.booking_id, v_booking.provider_id, NEW.id,
                'service_fee', v_booking.service_fee_amount, 0, 0, v_booking.service_fee_amount,
                'Service fee for booking ' || v_booking.booking_number,
                NOW()
            );
        END IF;

        -- 4. Tip
        IF v_booking.tip_amount > 0 THEN
            INSERT INTO public.finance_transactions (
                tenant_id, booking_id, provider_id, source_payment_id,
                transaction_type, amount, fees, commission, net,
                description, created_at
            ) VALUES (
                v_tenant_id, NEW.booking_id, v_booking.provider_id, NEW.id,
                'tip', v_booking.tip_amount, 0, 0, v_booking.tip_amount,
                'Tip for booking ' || v_booking.booking_number,
                NOW()
            );
        END IF;

        -- 5. Tax
        IF v_booking.tax_amount > 0 THEN
            INSERT INTO public.finance_transactions (
                tenant_id, booking_id, provider_id, source_payment_id,
                transaction_type, amount, fees, commission, net,
                description, created_at
            ) VALUES (
                v_tenant_id, NEW.booking_id, v_booking.provider_id, NEW.id,
                'tax', v_booking.tax_amount, 0, 0, v_booking.tax_amount,
                'Tax (VAT) for booking ' || v_booking.booking_number || ' - Provider must remit to SARS',
                NOW()
            );
        END IF;

        -- 6. Travel fee
        IF v_booking.travel_fee > 0 THEN
            INSERT INTO public.finance_transactions (
                tenant_id, booking_id, provider_id, source_payment_id,
                transaction_type, amount, fees, commission, net,
                description, created_at
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

COMMENT ON FUNCTION public.create_finance_ledger_from_payment IS
  'Creates finance ledger rows for completed non-Paystack booking_payments. '
  'Respects commission_enabled flag and provider commission_override. '
  'Uses actual payment amount for proportional commission. '
  'Booking-level items (tip/tax/travel/service_fee) recorded once per booking. '
  'Paystack payments are handled by the webhook app code.';
