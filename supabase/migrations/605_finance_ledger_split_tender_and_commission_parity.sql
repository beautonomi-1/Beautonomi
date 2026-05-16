-- Migration 605: Split-tender (wallet/gift + Paystack) ledger dedupe, commission parity, tax net=0,
-- tenant-scoped platform_settings, promotion_discount on trigger path, booking_payments UPDATE trigger.

-- PostgreSQL disallows OLD references in a WHEN clause when INSERT is among the events.
-- Split into two triggers so each WHEN clause only references the relevant pseudo-row.

DROP TRIGGER IF EXISTS create_finance_ledger_on_payment ON public.booking_payments;
DROP TRIGGER IF EXISTS create_finance_ledger_on_payment_insert ON public.booking_payments;
DROP TRIGGER IF EXISTS create_finance_ledger_on_payment_update ON public.booking_payments;

-- Fires when a booking_payment is inserted already-completed (e.g. cash/wallet settled inline).
CREATE TRIGGER create_finance_ledger_on_payment_insert
  AFTER INSERT ON public.booking_payments
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION public.create_finance_ledger_from_payment();

-- Fires when a booking_payment transitions to completed (pending → completed).
CREATE TRIGGER create_finance_ledger_on_payment_update
  AFTER UPDATE OF status ON public.booking_payments
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION public.create_finance_ledger_from_payment();

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
        COALESCE(b.promotion_discount_amount, 0) AS promotion_discount_amount
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
          AND ft.transaction_type IN ('tip', 'tax', 'travel_fee', 'platform_fee', 'service_fee', 'promotion_discount')
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
  'Tax net=0. promotion_discount when promotion present.';
