-- 800: classify card-machine tip payment rows as 'tip' in the finance ledger
--
-- Card-machine (PayCloud) tips are settled as their own booking_payments row with
-- payment_provider_data->>'tip' = 'true' (see lib/payments/settle-paycloud-payment.ts,
-- settleCardMachineTip). Without this migration the generic payment path recognised
-- that row as provider_earnings (service revenue), which:
--   * overstated recognised service earnings and understated tips in revenue reports;
--   * skipped the 'tip' finance_transactions row, so tip reporting missed machine tips.
-- Commission was already safe (662 zeroes commission on provider-collected tenders)
-- and payout balances were already safe (PayCloud rows are excluded as
-- provider-collected), so this is purely a classification fix.
--
-- Fix: redefine create_finance_ledger_from_payment() with the 662 body preserved
-- EXACTLY, plus one early branch after tenant resolution: a pure-gratuity row posts a
-- single 'tip' transaction (net = amount, commission 0) and returns — no
-- provider_earnings / commission proration, no booking-items block. The refund
-- reversal trigger (654) already proportionally reverses 'tip' components, so voids
-- of tipped captures self-correct.
--
-- Idempotency: the top-of-function source_payment_id dedupe covers the tip branch too.

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
    -- 662: true when the platform actually holds this tender. Paystack returns early above,
    -- so only wallet/gift_card remain platform-held; all other tenders are provider-collected.
    v_is_platform_held BOOLEAN;
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

    -- 800: pure gratuity rows (card-machine tips) are pass-through money for the
    -- provider/staff, never service revenue. Post a single 'tip' transaction and
    -- return — no provider_earnings, no commission, no booking-items block.
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

    -- 662: zero commission on provider-collected money. The platform only commissions money
    -- it holds (wallet/gift_card here; Paystack handled by the webhook and returned early).
    -- Cash, Yoco, bank_transfer, in-person card, etc. are the provider's own takings.
    v_is_platform_held := (NEW.payment_provider IN ('wallet', 'gift_card'));
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
  '662: commission is charged ONLY on platform-held tenders (wallet/gift_card here; Paystack via webhook); '
  'cash/Yoco/EFT/in-person are provider-collected and get zero commission (provider keeps 100%). '
  'Tax net=0. promotion_discount/membership_discount/loyalty_redemption contra rows when present (656). '
  '659: skips the provider_earnings row for walk-in additional-charge settlements '
  '(payment_provider_data->>source = walk_in) — recognized once via the walk_in_additional_charge row. '
  '800: pure gratuity rows (payment_provider_data->>tip = true, card-machine tips) post a single '
  'tip transaction instead of provider_earnings.';
