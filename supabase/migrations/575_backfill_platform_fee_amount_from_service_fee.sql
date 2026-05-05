-- Migration 575: Backfill platform_fee_amount from service_fee_amount
-- ============================================================================
-- Migration 559 added platform_fee_amount with DEFAULT 0 and attempted a
-- COALESCE-based backfill. However COALESCE(0, service_fee_amount) = 0 because
-- 0 is non-NULL, so any booking row that already had platform_fee_amount = 0
-- (from the DEFAULT) was not updated to the legacy service_fee_amount value.
--
-- This migration fixes those rows by using a numeric 0-aware comparison.
-- The trigger sync_booking_platform_fee_aliases_trigger (migration 559) also
-- uses COALESCE and has the same flaw for UPDATEs; we fix it here too.

-- 1. Backfill rows where platform_fee_amount is still 0 but service_fee_amount
--    holds the real customer-paid platform fee.
UPDATE public.bookings
SET
  platform_fee_amount     = service_fee_amount,
  platform_fee_percentage = COALESCE(
    NULLIF(platform_fee_percentage, 0),
    service_fee_percentage,
    0
  )
WHERE
  platform_fee_amount = 0
  AND service_fee_amount > 0;

-- 2. Replace the trigger function so the 0-fallback works correctly.
--    COALESCE only skips NULLs; use NULLIF to treat 0 the same as NULL so
--    the alias column wins when the canonical column is absent.
CREATE OR REPLACE FUNCTION public.sync_booking_platform_fee_aliases()
RETURNS trigger AS $$
BEGIN
  -- Treat 0 like NULL so the fallback alias column is used when the
  -- canonical column was not supplied (DEFAULT 0 → should inherit from alias).
  NEW.platform_fee_amount :=
    COALESCE(NULLIF(NEW.platform_fee_amount, 0), NEW.service_fee_amount, 0);
  NEW.platform_fee_percentage :=
    COALESCE(NULLIF(NEW.platform_fee_percentage, 0), NEW.service_fee_percentage, 0);
  NEW.platform_fee_config_id :=
    COALESCE(NEW.platform_fee_config_id, NEW.service_fee_config_id);
  NEW.platform_fee_paid_by :=
    COALESCE(NEW.platform_fee_paid_by, NEW.service_fee_paid_by, 'customer');

  NEW.service_fee_amount :=
    COALESCE(NULLIF(NEW.service_fee_amount, 0), NEW.platform_fee_amount, 0);
  NEW.service_fee_percentage :=
    COALESCE(NULLIF(NEW.service_fee_percentage, 0), NEW.platform_fee_percentage, 0);
  NEW.service_fee_config_id :=
    COALESCE(NEW.service_fee_config_id, NEW.platform_fee_config_id);
  NEW.service_fee_paid_by :=
    COALESCE(NEW.service_fee_paid_by, NEW.platform_fee_paid_by, 'customer');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.sync_booking_platform_fee_aliases() IS
  'Keeps platform_fee_* and legacy service_fee_* columns in sync. Uses NULLIF to treat 0 like NULL so the alias column is used as fallback when the canonical column was not provided.';

-- 3. Fix create_finance_ledger_from_payment() to use NULLIF-based fee read.
--    The original COALESCE(b.platform_fee_amount, b.service_fee_amount, 0)
--    has the same 0-is-non-NULL flaw: for bookings that still have
--    platform_fee_amount = 0 (legacy default) BEFORE this migration's backfill
--    is applied, or for cash/wallet payments arriving in the window between
--    migration 559 and this migration, the commission split was computed without
--    subtracting the platform fee. Using COALESCE(NULLIF(...)) makes the read
--    robust regardless of which column holds the real value.
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

    SELECT
        b.id,
        b.booking_number,
        b.provider_id,
        b.tenant_id,
        b.total_amount,
        -- Use NULLIF so a DEFAULT-0 platform_fee_amount falls through to
        -- the legacy service_fee_amount (same fix as migration 575 backfill).
        COALESCE(NULLIF(b.platform_fee_amount, 0), b.service_fee_amount, 0) AS platform_fee_amount,
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

    v_tenant_id := COALESCE(
        v_booking.tenant_id,
        (SELECT p.tenant_id FROM public.providers p WHERE p.id = v_booking.provider_id),
        public.tenant_default_za_id()
    );

    BEGIN
        SELECT COALESCE((s.settings->'payouts'->>'platform_commission_percentage')::NUMERIC / 100, 0.15)
        INTO v_platform_commission_rate
        FROM public.platform_settings s
        WHERE s.is_active = true
        ORDER BY s.created_at DESC
        LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        v_platform_commission_rate := 0.15;
    END;
    IF v_platform_commission_rate IS NULL THEN
        v_platform_commission_rate := 0.15;
    END IF;

    v_is_online_booking := (v_booking.booking_source = 'online');
    v_payment_amount := NEW.amount;
    v_total_amount := GREATEST(v_booking.total_amount, 0.01);

    IF v_is_online_booking THEN
        v_net_ratio := GREATEST(0, (v_total_amount - v_booking.platform_fee_amount - v_booking.tax_amount - v_booking.travel_fee)) / v_total_amount;
        v_commission_base := ROUND(v_payment_amount * v_net_ratio, 2);
        v_platform_commission := ROUND(v_commission_base * v_platform_commission_rate, 2);
        v_provider_earnings := v_commission_base - v_platform_commission;
    ELSE
        v_net_ratio := GREATEST(0, (v_total_amount - v_booking.tax_amount - v_booking.travel_fee)) / v_total_amount;
        v_commission_base := ROUND(v_payment_amount * v_net_ratio, 2);
        v_platform_commission := 0;
        v_provider_earnings := v_commission_base;
    END IF;

    IF v_is_online_booking AND v_platform_commission > 0 THEN
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

    INSERT INTO public.finance_transactions (
        tenant_id, booking_id, provider_id, source_payment_id,
        transaction_type, amount, fees, commission, net, description, created_at
    ) VALUES (
        v_tenant_id, NEW.booking_id, v_booking.provider_id, NEW.id,
        'provider_earnings', v_provider_earnings, 0, 0, v_provider_earnings,
        'Provider earnings for booking ' || v_booking.booking_number || ' (via ' || NEW.payment_method || ', source: ' || v_booking.booking_source || ')',
        NOW()
    );

    v_has_existing_booking_items := EXISTS (
        SELECT 1 FROM public.finance_transactions ft
        WHERE ft.booking_id = NEW.booking_id
          AND ft.transaction_type IN ('tip', 'tax', 'travel_fee', 'platform_fee', 'service_fee')
    );

    IF NOT v_has_existing_booking_items THEN
        IF v_is_online_booking AND v_booking.platform_fee_amount > 0 THEN
            INSERT INTO public.finance_transactions (
                tenant_id, booking_id, provider_id, source_payment_id,
                transaction_type, amount, fees, commission, net, description, created_at
            ) VALUES (
                v_tenant_id, NEW.booking_id, v_booking.provider_id, NEW.id,
                'platform_fee', v_booking.platform_fee_amount, 0, 0, v_booking.platform_fee_amount,
                'Platform fee for booking ' || v_booking.booking_number,
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
                'tax', v_booking.tax_amount, 0, 0, v_booking.tax_amount,
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
  'Creates finance ledger rows for completed booking payments (non-Paystack). Uses COALESCE(NULLIF(...)) for platform_fee_amount so a legacy DEFAULT-0 value correctly falls through to service_fee_amount.';
