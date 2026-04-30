-- ============================================================================
-- Migration 559: Canonical Platform Fee model for bookings
-- ============================================================================
-- Booking rows historically stored customer-paid platform fees in service_fee_*
-- columns. Those columns were never provider-owned fees. This migration adds
-- platform_fee_* aliases, backfills them, and keeps both names synchronized so
-- old clients remain readable while new product/API logic uses Platform Fee.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS platform_fee_config_id uuid,
  ADD COLUMN IF NOT EXISTS platform_fee_percentage numeric(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee_amount numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee_paid_by text DEFAULT 'customer';

UPDATE public.bookings
SET
  platform_fee_config_id = COALESCE(platform_fee_config_id, service_fee_config_id),
  platform_fee_percentage = COALESCE(platform_fee_percentage, service_fee_percentage, 0),
  platform_fee_amount = COALESCE(platform_fee_amount, service_fee_amount, 0),
  platform_fee_paid_by = COALESCE(platform_fee_paid_by, service_fee_paid_by, 'customer')
WHERE
  platform_fee_config_id IS DISTINCT FROM COALESCE(platform_fee_config_id, service_fee_config_id)
  OR platform_fee_percentage IS DISTINCT FROM COALESCE(platform_fee_percentage, service_fee_percentage, 0)
  OR platform_fee_amount IS DISTINCT FROM COALESCE(platform_fee_amount, service_fee_amount, 0)
  OR platform_fee_paid_by IS DISTINCT FROM COALESCE(platform_fee_paid_by, service_fee_paid_by, 'customer');

COMMENT ON COLUMN public.bookings.platform_fee_amount IS
  'Canonical customer-paid Platform Fee amount retained by Beautonomi/platform.';
COMMENT ON COLUMN public.bookings.platform_fee_percentage IS
  'Canonical customer-paid Platform Fee percentage snapshot, if percentage based.';
COMMENT ON COLUMN public.bookings.platform_fee_config_id IS
  'Canonical platform_fee_config snapshot reference for the customer-paid Platform Fee.';
COMMENT ON COLUMN public.bookings.platform_fee_paid_by IS
  'Party charged for the Platform Fee. Current product model is customer-paid.';

COMMENT ON COLUMN public.bookings.service_fee_amount IS
  'DEPRECATED legacy persistence name for platform_fee_amount; not provider-owned service fee.';
COMMENT ON COLUMN public.bookings.service_fee_percentage IS
  'DEPRECATED legacy persistence name for platform_fee_percentage; not provider-owned service fee.';
COMMENT ON COLUMN public.bookings.service_fee_config_id IS
  'DEPRECATED legacy persistence name for platform_fee_config_id.';
COMMENT ON COLUMN public.bookings.service_fee_paid_by IS
  'DEPRECATED legacy persistence name for platform_fee_paid_by.';

CREATE OR REPLACE FUNCTION public.sync_booking_platform_fee_aliases()
RETURNS trigger AS $$
BEGIN
  NEW.platform_fee_amount := COALESCE(NEW.platform_fee_amount, NEW.service_fee_amount, 0);
  NEW.platform_fee_percentage := COALESCE(NEW.platform_fee_percentage, NEW.service_fee_percentage, 0);
  NEW.platform_fee_config_id := COALESCE(NEW.platform_fee_config_id, NEW.service_fee_config_id);
  NEW.platform_fee_paid_by := COALESCE(NEW.platform_fee_paid_by, NEW.service_fee_paid_by, 'customer');

  NEW.service_fee_amount := COALESCE(NEW.service_fee_amount, NEW.platform_fee_amount, 0);
  NEW.service_fee_percentage := COALESCE(NEW.service_fee_percentage, NEW.platform_fee_percentage, 0);
  NEW.service_fee_config_id := COALESCE(NEW.service_fee_config_id, NEW.platform_fee_config_id);
  NEW.service_fee_paid_by := COALESCE(NEW.service_fee_paid_by, NEW.platform_fee_paid_by, 'customer');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_booking_platform_fee_aliases_trigger ON public.bookings;
CREATE TRIGGER sync_booking_platform_fee_aliases_trigger
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.sync_booking_platform_fee_aliases();

-- Future booking-payment trigger rows should use platform_fee. Historical
-- service_fee rows remain readable as legacy platform-fee revenue in reports.
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
        COALESCE(b.platform_fee_amount, b.service_fee_amount, 0) AS platform_fee_amount,
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
  'Creates finance ledger rows for completed booking payments. Booking platform fees are platform_fee rows; legacy service_fee rows remain historical platform-fee revenue.';

-- Keep double-entry shadow ledger aligned with new booking platform_fee rows.
CREATE OR REPLACE FUNCTION public.shadow_post_finance_transaction()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry_id       uuid;
  v_cash_acct      uuid;
  v_payable_acct   uuid;
  v_platform_acct  uuid;
  v_refund_acct    uuid;
  v_tax_acct       uuid;
  v_tips_acct      uuid;
  v_gross          numeric := COALESCE(NEW.amount, 0);
  v_platform_fee   numeric := COALESCE(NEW.net, 0);
  v_currency       text    := 'ZAR';
BEGIN
  -- Keep this trigger in lock-step with the full shadow-ledger posting map
  -- from migration 510. This migration only renamed/added platform_fee rows;
  -- it must not narrow the transaction_type coverage for wallet, gift card,
  -- subscription, ads, membership, promotion, or product-order flows.
  PERFORM public._shadow_replay_finance_tx_row(NEW);
  RETURN NEW;

  IF NEW.transaction_type NOT IN (
    'payment',
    'refund',
    'tip',
    'payout',
    'cancellation_fee',
    'provider_earnings',
    'platform_fee',
    'service_fee',
    'tax',
    'travel_fee'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_cash_acct     FROM public.gl_accounts WHERE code = '1000';
  SELECT id INTO v_payable_acct  FROM public.gl_accounts WHERE code = '2000';
  SELECT id INTO v_platform_acct FROM public.gl_accounts WHERE code = '3000';
  SELECT id INTO v_refund_acct   FROM public.gl_accounts WHERE code = '4100';
  SELECT id INTO v_tax_acct      FROM public.gl_accounts WHERE code = '2100';
  SELECT id INTO v_tips_acct     FROM public.gl_accounts WHERE code = '2200';

  INSERT INTO public.journal_entries (
    provider_id, booking_id, payment_id, refund_id, source, external_ref,
    description, posted_at, reporting_currency, created_by
  ) VALUES (
    NEW.provider_id,
    NEW.booking_id,
    NEW.source_payment_id,
    NEW.source_refund_id,
    'finance_transactions',
    NEW.id::text,
    NEW.transaction_type,
    COALESCE(NEW.created_at, now()),
    'ZAR',
    'shadow-trigger'
  ) RETURNING id INTO v_entry_id;

  IF NEW.transaction_type = 'payment' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,     'debit',  v_gross,                  v_currency, v_gross,                  'ZAR'),
      (v_entry_id, v_platform_acct, 'credit', v_platform_fee,           v_currency, v_platform_fee,           'ZAR'),
      (v_entry_id, v_payable_acct,  'credit', v_gross - v_platform_fee, v_currency, v_gross - v_platform_fee, 'ZAR');

  ELSIF NEW.transaction_type = 'refund' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_refund_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_cash_acct,   'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');

  ELSIF NEW.transaction_type = 'tip' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_tips_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');

  ELSIF NEW.transaction_type = 'payout' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_payable_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_cash_acct,    'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');

  ELSIF NEW.transaction_type = 'tax' THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_tax_acct,  'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');

  ELSIF NEW.transaction_type IN ('platform_fee', 'service_fee') THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,     'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_platform_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');

  ELSIF NEW.transaction_type IN ('cancellation_fee', 'travel_fee', 'provider_earnings') THEN
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,    'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.shadow_post_finance_transaction() IS
  'Shadows completed finance_transactions rows into journal_entries. platform_fee and legacy service_fee both post to platform revenue.';

UPDATE public.finance_transactions
SET description = regexp_replace(description, '^Service fee', 'Platform fee', 'i')
WHERE transaction_type = 'service_fee'
  AND description ~* '^Service fee';
