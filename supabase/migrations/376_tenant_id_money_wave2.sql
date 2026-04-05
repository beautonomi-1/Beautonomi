-- Wave 3: tenant_id on remaining money tables + NOT NULL end-state (spec §6.6).
-- 
-- Tables covered here:
-- - finance_transactions          (finance ledger for bookings, payouts, fees, tips, tax, travel)
-- - membership_orders             (customer memberships purchased via providers)
-- - product_orders                (e-commerce product orders)
-- - provider_subscriptions        (provider SaaS subscriptions)
-- - wallet_transactions           (customer wallet ledger; column added in 349 but still nullable)
-- - gift_card_orders              (customer gift card purchases; column added in 343 but still nullable)
--
-- Strategy:
-- 1) Add tenant_id where missing (FK to public.tenants).
-- 2) Backfill from existing relationships (bookings / providers).
-- 3) Default any remaining NULLs to the legacy ZA tenant via tenant_default_za_id().
-- 4) Add supporting indexes.
-- 5) Enforce NOT NULL on tenant_id for these tables.

-- 1. Add tenant_id columns where they do not yet exist
ALTER TABLE IF EXISTS public.finance_transactions
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

ALTER TABLE IF EXISTS public.membership_orders
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

ALTER TABLE IF EXISTS public.product_orders
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

ALTER TABLE IF EXISTS public.provider_subscriptions
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- wallet_transactions.tenant_id was added in migration 349, but keep this idempotent in case of drift.
ALTER TABLE IF EXISTS public.wallet_transactions
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

-- gift_card_orders.tenant_id was added in migration 343, but keep this idempotent in case of drift.
ALTER TABLE IF EXISTS public.gift_card_orders
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);


-- 2. Backfill tenant_id from existing relationships

-- 2.1 finance_transactions: prefer booking tenant when available
UPDATE public.finance_transactions ft
SET tenant_id = b.tenant_id
FROM public.bookings b
WHERE ft.booking_id = b.id
  AND b.tenant_id IS NOT NULL
  AND ft.tenant_id IS NULL;

-- 2.2 membership_orders: derive from provider tenant
UPDATE public.membership_orders mo
SET tenant_id = p.tenant_id
FROM public.providers p
WHERE mo.provider_id = p.id
  AND p.tenant_id IS NOT NULL
  AND mo.tenant_id IS NULL;

-- 2.3 product_orders: derive from provider tenant
UPDATE public.product_orders po
SET tenant_id = p.tenant_id
FROM public.providers p
WHERE po.provider_id = p.id
  AND p.tenant_id IS NOT NULL
  AND po.tenant_id IS NULL;

-- 2.4 provider_subscriptions: derive from provider tenant
UPDATE public.provider_subscriptions ps
SET tenant_id = p.tenant_id
FROM public.providers p
WHERE ps.provider_id = p.id
  AND p.tenant_id IS NOT NULL
  AND ps.tenant_id IS NULL;

-- 2.5 wallet_transactions: if this row is linked to a booking, inherit its tenant
-- (ledger uses reference_id + reference_type, not booking_id — see 002_users_and_auth.sql)
UPDATE public.wallet_transactions wt
SET tenant_id = b.tenant_id
FROM public.bookings b
WHERE wt.reference_type = 'booking'
  AND wt.reference_id = b.id
  AND b.tenant_id IS NOT NULL
  AND wt.tenant_id IS NULL;

-- 2.6 gift_card_orders: prefer provider tenant when present (migration 343 already did this;
-- run again idempotently to cover any rows created before provider.tenant_id backfill).
UPDATE public.gift_card_orders gco
SET tenant_id = p.tenant_id
FROM public.providers p
WHERE gco.provider_id = p.id
  AND p.tenant_id IS NOT NULL
  AND gco.tenant_id IS NULL;


-- 3. Legacy safety net: default remaining NULL tenant_id to the ZA tenant.
-- This respects NN-8 by keeping the implicit default as a data-migration convenience only,
-- not as a runtime fallback for host/tenant resolution.

UPDATE public.finance_transactions ft
SET tenant_id = public.tenant_default_za_id()
WHERE ft.tenant_id IS NULL;

UPDATE public.membership_orders mo
SET tenant_id = public.tenant_default_za_id()
WHERE mo.tenant_id IS NULL;

UPDATE public.product_orders po
SET tenant_id = public.tenant_default_za_id()
WHERE po.tenant_id IS NULL;

UPDATE public.provider_subscriptions ps
SET tenant_id = public.tenant_default_za_id()
WHERE ps.tenant_id IS NULL;

UPDATE public.wallet_transactions wt
SET tenant_id = public.tenant_default_za_id()
WHERE wt.tenant_id IS NULL;

UPDATE public.gift_card_orders gco
SET tenant_id = public.tenant_default_za_id()
WHERE gco.tenant_id IS NULL;


-- 4. Supporting indexes for hot paths
CREATE INDEX IF NOT EXISTS idx_finance_transactions_tenant_id
  ON public.finance_transactions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_membership_orders_tenant_id
  ON public.membership_orders (tenant_id);

CREATE INDEX IF NOT EXISTS idx_product_orders_tenant_id
  ON public.product_orders (tenant_id);

CREATE INDEX IF NOT EXISTS idx_provider_subscriptions_tenant_id
  ON public.provider_subscriptions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_tenant_id_not_null
  ON public.wallet_transactions (tenant_id)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gift_card_orders_tenant_id_not_null
  ON public.gift_card_orders (tenant_id)
  WHERE tenant_id IS NOT NULL;


-- 4b. Wallet RPCs and triggers must populate tenant_id before NOT NULL on wallet_transactions.
-- wallet_credit_admin (349): ensure inserts never leave tenant_id NULL when column is required.
CREATE OR REPLACE FUNCTION public.wallet_credit_admin(
  p_user_id UUID,
  p_amount NUMERIC,
  p_currency TEXT DEFAULT 'ZAR',
  p_description TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_wallet_id UUID;
  v_balance NUMERIC;
  v_currency TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  SELECT id, balance, currency INTO v_wallet_id, v_balance, v_currency
  FROM user_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO user_wallets (user_id, currency) VALUES (p_user_id, COALESCE(p_currency, 'ZAR'))
    RETURNING id, balance, currency INTO v_wallet_id, v_balance, v_currency;
  END IF;

  IF p_currency IS NOT NULL AND v_currency <> p_currency THEN
    RAISE EXCEPTION 'Currency mismatch (wallet: %, credit: %)', v_currency, p_currency;
  END IF;

  UPDATE user_wallets SET balance = balance + p_amount WHERE id = v_wallet_id;

  INSERT INTO wallet_transactions (wallet_id, type, amount, description, reference_id, reference_type, tenant_id)
  VALUES (
    v_wallet_id,
    'credit',
    p_amount,
    p_description,
    p_reference_id,
    p_reference_type,
    COALESCE(p_tenant_id, public.tenant_default_za_id())
  );

  RETURN jsonb_build_object('wallet_id', v_wallet_id, 'balance', v_balance + p_amount, 'currency', v_currency);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.wallet_credit_admin(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wallet_credit_admin(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.wallet_credit_admin(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_credit_admin(UUID, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID) TO service_role;

DROP FUNCTION IF EXISTS public.wallet_debit_self(NUMERIC, TEXT, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.wallet_debit_self(
  p_amount NUMERIC,
  p_description TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_wallet_id UUID;
  v_balance NUMERIC;
  v_currency TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT id, balance, currency INTO v_wallet_id, v_balance, v_currency
  FROM user_wallets
  WHERE user_id = auth.uid()
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO user_wallets (user_id, currency) VALUES (auth.uid(), 'ZAR')
    RETURNING id, balance, currency INTO v_wallet_id, v_balance, v_currency;
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  UPDATE user_wallets SET balance = balance - p_amount WHERE id = v_wallet_id;

  INSERT INTO wallet_transactions (wallet_id, type, amount, description, reference_id, reference_type, tenant_id)
  VALUES (
    v_wallet_id,
    'debit',
    p_amount,
    p_description,
    p_reference_id,
    p_reference_type,
    COALESCE(p_tenant_id, public.tenant_default_za_id())
  );

  RETURN jsonb_build_object('wallet_id', v_wallet_id, 'balance', v_balance - p_amount, 'currency', v_currency);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.wallet_debit_self(NUMERIC, TEXT, UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_debit_self(NUMERIC, TEXT, UUID, TEXT, UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.wallet_credit_self(NUMERIC, TEXT, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.wallet_credit_self(
  p_amount NUMERIC,
  p_description TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_wallet_id UUID;
  v_balance NUMERIC;
  v_currency TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT id, balance, currency INTO v_wallet_id, v_balance, v_currency
  FROM user_wallets
  WHERE user_id = auth.uid()
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO user_wallets (user_id, currency) VALUES (auth.uid(), 'ZAR')
    RETURNING id, balance, currency INTO v_wallet_id, v_balance, v_currency;
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  UPDATE user_wallets SET balance = balance + p_amount WHERE id = v_wallet_id;

  INSERT INTO wallet_transactions (wallet_id, type, amount, description, reference_id, reference_type, tenant_id)
  VALUES (
    v_wallet_id,
    'credit',
    p_amount,
    p_description,
    p_reference_id,
    p_reference_type,
    COALESCE(p_tenant_id, public.tenant_default_za_id())
  );

  RETURN jsonb_build_object('wallet_id', v_wallet_id, 'balance', v_balance + p_amount, 'currency', v_currency);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.wallet_credit_self(NUMERIC, TEXT, UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_credit_self(NUMERIC, TEXT, UUID, TEXT, UUID) TO authenticated;

-- Loyalty milestone wallet lines (039): tag with default tenant when no booking context.
CREATE OR REPLACE FUNCTION public.award_loyalty_milestones()
RETURNS TRIGGER AS $$
DECLARE
  v_balance INTEGER;
  v_wallet_id UUID;
  v_wallet_currency TEXT;
  m RECORD;
BEGIN
  IF NEW.transaction_type NOT IN ('earned', 'adjusted') THEN
    RETURN NEW;
  END IF;

  v_balance := get_user_loyalty_balance(NEW.user_id);

  SELECT id, currency INTO v_wallet_id, v_wallet_currency
  FROM user_wallets
  WHERE user_id = NEW.user_id
  LIMIT 1
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO user_wallets (user_id, currency) VALUES (NEW.user_id, 'ZAR')
    RETURNING id, currency INTO v_wallet_id, v_wallet_currency;
  END IF;

  FOR m IN
    SELECT *
    FROM loyalty_milestones
    WHERE is_active = true
      AND points_threshold <= v_balance
    ORDER BY points_threshold ASC
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM loyalty_milestone_awards
      WHERE user_id = NEW.user_id AND milestone_id = m.id
    ) THEN
      INSERT INTO loyalty_milestone_awards (
        user_id,
        milestone_id,
        awarded_points_balance,
        reward_type,
        reward_amount,
        reward_currency,
        metadata
      )
      VALUES (
        NEW.user_id,
        m.id,
        v_balance,
        m.reward_type,
        m.reward_amount,
        m.reward_currency,
        jsonb_build_object('source_tx_id', NEW.id, 'source_reference_type', NEW.reference_type, 'source_reference_id', NEW.reference_id)
      );

      IF m.reward_type = 'wallet_credit' AND m.reward_amount > 0 THEN
        UPDATE user_wallets SET balance = balance + m.reward_amount WHERE id = v_wallet_id;
        INSERT INTO wallet_transactions (wallet_id, type, amount, description, reference_id, reference_type, tenant_id)
        VALUES (
          v_wallet_id,
          'credit',
          m.reward_amount,
          CONCAT('Loyalty milestone reward: ', m.name),
          m.id,
          'loyalty_milestone',
          public.tenant_default_za_id()
        );
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.award_loyalty_milestones() FROM PUBLIC;


-- 4c. booking_payments trigger (migrations 169 + 179): finance inserts must set tenant_id before NOT NULL.
-- Preserves 179 booking_source / walk-in fee rules; adds tenant resolution like app-ledgers.
CREATE OR REPLACE FUNCTION public.create_finance_ledger_from_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_booking RECORD;
    v_tenant_id UUID;
    v_platform_commission_rate NUMERIC(5, 4) := 0.15;
    v_commission_base NUMERIC(10, 2);
    v_platform_commission NUMERIC(10, 2);
    v_provider_earnings NUMERIC(10, 2);
    v_is_online_booking BOOLEAN;
BEGIN
    IF NEW.status != 'completed' THEN
        RETURN NEW;
    END IF;

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

    v_tenant_id := COALESCE(
        v_booking.tenant_id,
        (SELECT p.tenant_id FROM public.providers p WHERE p.id = v_booking.provider_id),
        public.tenant_default_za_id()
    );

    IF EXISTS (
        SELECT 1 FROM public.finance_transactions ft
        WHERE ft.booking_id = NEW.booking_id
          AND ft.transaction_type = 'provider_earnings'
    ) THEN
        RAISE NOTICE 'Finance transactions already exist for booking %, skipping creation', v_booking.booking_number;
        RETURN NEW;
    END IF;

    v_is_online_booking := (v_booking.booking_source = 'online');

    IF v_is_online_booking THEN
        v_commission_base := v_booking.total_amount
            - v_booking.service_fee_amount
            - v_booking.tax_amount
            - v_booking.travel_fee;
        v_platform_commission := v_commission_base * v_platform_commission_rate;
        v_provider_earnings := v_commission_base - v_platform_commission;
    ELSE
        v_commission_base := v_booking.total_amount
            - v_booking.tax_amount
            - v_booking.travel_fee;
        v_platform_commission := 0;
        v_provider_earnings := v_commission_base;
    END IF;

    IF v_is_online_booking AND v_platform_commission > 0 THEN
        INSERT INTO public.finance_transactions (
            tenant_id,
            booking_id,
            provider_id,
            transaction_type,
            amount,
            fees,
            commission,
            net,
            description,
            created_at
        ) VALUES (
            v_tenant_id,
            NEW.booking_id,
            v_booking.provider_id,
            'payment',
            v_commission_base,
            0,
            v_platform_commission,
            v_platform_commission,
            'Payment for booking ' || v_booking.booking_number || ' (via ' || NEW.payment_method || ')',
            NOW()
        );
    END IF;

    INSERT INTO public.finance_transactions (
        tenant_id,
        booking_id,
        provider_id,
        transaction_type,
        amount,
        fees,
        commission,
        net,
        description,
        created_at
    ) VALUES (
        v_tenant_id,
        NEW.booking_id,
        v_booking.provider_id,
        'provider_earnings',
        v_provider_earnings,
        0,
        0,
        v_provider_earnings,
        'Provider earnings for booking ' || v_booking.booking_number || ' (via ' || NEW.payment_method || ', source: ' || v_booking.booking_source || ')',
        NOW()
    );

    IF v_is_online_booking AND v_booking.service_fee_amount > 0 THEN
        INSERT INTO public.finance_transactions (
            tenant_id,
            booking_id,
            provider_id,
            transaction_type,
            amount,
            fees,
            commission,
            net,
            description,
            created_at
        ) VALUES (
            v_tenant_id,
            NEW.booking_id,
            v_booking.provider_id,
            'service_fee',
            v_booking.service_fee_amount,
            0,
            0,
            v_booking.service_fee_amount,
            'Service fee for booking ' || v_booking.booking_number,
            NOW()
        );
    END IF;

    IF v_booking.tip_amount > 0 THEN
        INSERT INTO public.finance_transactions (
            tenant_id,
            booking_id,
            provider_id,
            transaction_type,
            amount,
            fees,
            commission,
            net,
            description,
            created_at
        ) VALUES (
            v_tenant_id,
            NEW.booking_id,
            v_booking.provider_id,
            'tip',
            v_booking.tip_amount,
            0,
            0,
            v_booking.tip_amount,
            'Tip for booking ' || v_booking.booking_number,
            NOW()
        );
    END IF;

    IF v_booking.tax_amount > 0 THEN
        INSERT INTO public.finance_transactions (
            tenant_id,
            booking_id,
            provider_id,
            transaction_type,
            amount,
            fees,
            commission,
            net,
            description,
            created_at
        ) VALUES (
            v_tenant_id,
            NEW.booking_id,
            v_booking.provider_id,
            'tax',
            v_booking.tax_amount,
            0,
            0,
            v_booking.tax_amount,
            'Tax (VAT) for booking ' || v_booking.booking_number || ' - Provider must remit to SARS',
            NOW()
        );
    END IF;

    IF v_booking.travel_fee > 0 THEN
        INSERT INTO public.finance_transactions (
            tenant_id,
            booking_id,
            provider_id,
            transaction_type,
            amount,
            fees,
            commission,
            net,
            description,
            created_at
        ) VALUES (
            v_tenant_id,
            NEW.booking_id,
            v_booking.provider_id,
            'travel_fee',
            v_booking.travel_fee,
            0,
            0,
            v_booking.travel_fee,
            'Travel fee for booking ' || v_booking.booking_number,
            NOW()
        );
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error creating finance transactions for booking %: %', NEW.booking_id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.create_finance_ledger_from_payment IS 'Creates finance ledger rows for completed booking_payments (169/179 logic). Sets tenant_id from booking, provider, or ZA default.';


-- 5. Enforce NOT NULL on tenant_id for these money tables (end-state invariant)
ALTER TABLE public.finance_transactions
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.membership_orders
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.product_orders
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.provider_subscriptions
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.wallet_transactions
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.gift_card_orders
  ALTER COLUMN tenant_id SET NOT NULL;

