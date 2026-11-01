-- 1027: Provider-portal bookings and till payments must not post platform_fee
-- or reduce provider_earnings by a customer platform fee Beautonomi never collects.

CREATE OR REPLACE FUNCTION public.create_finance_ledger_from_payment()
RETURNS TRIGGER AS $$
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

    v_is_online_booking := (v_booking.booking_source = 'online');
    v_payment_amount := NEW.amount;
    v_total_amount := GREATEST(v_booking.total_amount, 0.01);
    v_pf := COALESCE(v_booking.platform_fee_amount, 0);

    -- Provider-portal / till money: never recognize platform_fee or shrink earnings by a fee
    -- the platform does not collect on provider-collected tenders.
    IF NOT v_is_platform_held
       OR v_booking.booking_source IN ('provider', 'walk_in') THEN
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

        SELECT COALESCE(SUM(ft.net), 0) INTO v_posted_legs
        FROM public.finance_transactions ft
        WHERE ft.booking_id = NEW.booking_id
          AND ft.transaction_type IN ('provider_earnings', 'payment',
            'platform_fee', 'service_fee', 'tip', 'tax', 'travel_fee')
          AND ft.net > 0;

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
        PERFORM public.log_finance_ledger_trigger_failure(NEW.booking_id, NEW.id, SQLERRM);
        RAISE WARNING 'Error creating finance transactions for booking %: %', NEW.booking_id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

