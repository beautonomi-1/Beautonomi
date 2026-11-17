-- =============================================================================
-- 10138_audit_security_hardening.sql
-- Financial-systems audit (audit/05-findings.md) — security & hard-integrity fixes.
--
-- Findings addressed here:
--   F4-02  insert_payout_request_guarded: text -> payout_status cast (payouts 500 on every call)
--   F4-03  ux_finance_transactions_source_payment_per_type collides with refund ledger rows
--   F2-01  booking_refunds: staff/owner could INSERT/UPDATE/DELETE refunds directly (RLS FOR ALL)
--   F2-02  additional_charges: customer UPDATE policy without column restriction
--   F2-23  reserve_gift_card_redemption: no booking-ownership check
--   F2-22  validate_refund_amount: booking-level over-refund was WARNING only
--   F4-05  hosted default privileges grant EXECUTE to anon/authenticated on every new function
--   F2-61, F2-63, F2-64, F2-65, F2-66, F2-11, F2-56  anon/authenticated-executable SECURITY DEFINER functions
--   F3-01, F3-21  no CHECK constraints on product prices / staff commission rates
--   F2-03, F2-04, F2-29  missing idempotency uniqueness (stripe/flutterwave payments, yoco webhook events, refund_provider_id)
--
-- All statements are idempotent. Index/constraint creation that could fail on
-- pre-existing bad data is wrapped so the migration still applies and the
-- problem is surfaced as a WARNING for manual clean-up.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- F4-02  payouts.status is an enum; the RPC inserted text.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.insert_payout_request_guarded(
  p_provider_id uuid,
  p_max_available_before_reserve numeric,
  p_payout jsonb
)
RETURNS SETOF public.payouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_pending_sum NUMERIC;
  v_dispute_reserve NUMERIC;
  v_max_available NUMERIC;
  v_amount NUMERIC;
  v_row public.payouts%ROWTYPE;
  v_lock_class INT := 8847124;
  v_status public.payout_status;
BEGIN
  PERFORM pg_advisory_xact_lock(v_lock_class, hashtext(p_provider_id::text));

  IF EXISTS (
    SELECT 1
    FROM public.provider_payout_holds h
    WHERE h.provider_id = p_provider_id
      AND h.released_at IS NULL
  ) THEN
    RAISE EXCEPTION 'PAYOUT_HELD'
      USING ERRCODE = 'check_violation';
  END IF;

  v_amount := (p_payout->>'amount')::NUMERIC;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Only 'pending' may be requested through this path; anything else is an
  -- approval-stage transition handled by admin routes.
  BEGIN
    v_status := COALESCE(NULLIF(p_payout->>'status', ''), 'pending')::public.payout_status;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'INVALID_STATUS' USING ERRCODE = 'check_violation';
  END;
  IF v_status <> 'pending'::public.payout_status THEN
    RAISE EXCEPTION 'INVALID_STATUS' USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(SUM(net_amount), 0)
  INTO v_pending_sum
  FROM public.payouts
  WHERE provider_id = p_provider_id
    AND status IN ('pending', 'processing');

  SELECT COALESCE(SUM(amount), 0)
    INTO v_dispute_reserve
  FROM public.payment_disputes
  WHERE provider_id = p_provider_id
    AND status IN ('open', 'awaiting_bank');

  v_max_available := GREATEST(0, p_max_available_before_reserve - v_dispute_reserve);

  IF v_pending_sum + v_amount > v_max_available + 0.000001 THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.payouts (
    provider_id,
    payout_number,
    amount,
    currency,
    status,
    payout_method,
    payout_account_details,
    platform_fee_amount,
    platform_fee_percentage,
    net_amount,
    scheduled_at
  )
  VALUES (
    p_provider_id,
    p_payout->>'payout_number',
    v_amount,
    COALESCE(p_payout->>'currency', 'ZAR'),
    v_status,
    COALESCE(p_payout->>'payout_method', 'bank_transfer'),
    COALESCE(p_payout->'payout_account_details', '{}'::jsonb),
    COALESCE((p_payout->>'platform_fee_amount')::NUMERIC, 0),
    COALESCE((p_payout->>'platform_fee_percentage')::NUMERIC, 0),
    COALESCE((p_payout->>'net_amount')::NUMERIC, v_amount),
    COALESCE((p_payout->>'scheduled_at')::TIMESTAMPTZ, NOW())
  )
  RETURNING * INTO v_row;

  RETURN NEXT v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.insert_payout_request_guarded(uuid, numeric, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_payout_request_guarded(uuid, numeric, jsonb) TO service_role;

-- -----------------------------------------------------------------------------
-- F4-03  Refund reversal rows carry source_payment_id = booking_refunds.payment_id
--        and one row per refund_component, so the (source_payment_id, transaction_type)
--        uniqueness from 489 can only hold for non-refund rows. Refund rows are
--        already de-duplicated by ux_finance_transactions_source_refund_component.
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.ux_finance_transactions_source_payment_per_type;
CREATE UNIQUE INDEX IF NOT EXISTS ux_finance_transactions_source_payment_per_type
  ON public.finance_transactions (source_payment_id, transaction_type)
  WHERE source_payment_id IS NOT NULL AND source_refund_id IS NULL;

-- -----------------------------------------------------------------------------
-- F2-01  booking_refunds: all writes go through the service role (API). Owners
--        and staff may read; nobody writes through PostgREST with a user JWT.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Providers can manage refunds" ON public.booking_refunds;
DROP POLICY IF EXISTS "Providers can view refunds" ON public.booking_refunds;
CREATE POLICY "Providers can view refunds" ON public.booking_refunds
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.bookings
      WHERE bookings.id = booking_refunds.booking_id
        AND EXISTS (
          SELECT 1
          FROM public.providers
          WHERE providers.id = bookings.provider_id
            AND (
              providers.user_id = auth.uid()
              OR EXISTS (
                SELECT 1 FROM public.provider_staff
                WHERE provider_staff.provider_id = providers.id
                  AND provider_staff.user_id = auth.uid()
                  AND COALESCE(provider_staff.is_active, true)
              )
            )
        )
    )
  );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.booking_refunds FROM anon, authenticated;
REVOKE ALL ON public.booking_refunds FROM anon;

-- -----------------------------------------------------------------------------
-- F2-02  additional_charges: customers pay through the API (service role);
--        they must not be able to UPDATE amount/status themselves.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Customers can update own booking additional charges" ON public.additional_charges;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.additional_charges FROM anon, authenticated;
REVOKE ALL ON public.additional_charges FROM anon;

-- -----------------------------------------------------------------------------
-- F2-23  reserve_gift_card_redemption: caller must be the booking's customer or
--        an owner/active staff member of the booking's provider.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_gift_card_redemption(
  p_code text,
  p_amount numeric,
  p_booking_id uuid,
  p_currency text DEFAULT 'ZAR'::text
)
RETURNS TABLE(gift_card_id uuid, redemption_id uuid, remaining_balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_gift_card gift_cards%ROWTYPE;
  v_redemption gift_card_redemptions%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  IF p_booking_id IS NULL THEN
    RAISE EXCEPTION 'Booking required';
  END IF;

  -- Ownership: the booking's customer, or the provider owner / active staff.
  IF NOT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.id = p_booking_id
      AND (
        b.customer_id = v_uid
        OR EXISTS (
          SELECT 1 FROM public.providers p
          WHERE p.id = b.provider_id AND p.user_id = v_uid
        )
        OR EXISTS (
          SELECT 1 FROM public.provider_staff s
          WHERE s.provider_id = b.provider_id
            AND s.user_id = v_uid
            AND COALESCE(s.is_active, true)
        )
      )
  ) THEN
    -- Same message as an unknown code so the function is not a booking-id oracle.
    RAISE EXCEPTION 'Invalid gift card code';
  END IF;

  -- idempotency: if a redemption already exists for this booking, return it
  SELECT * INTO v_redemption
  FROM gift_card_redemptions
  WHERE booking_id = p_booking_id
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_redemption.gift_card_id, v_redemption.id, NULL::NUMERIC;
    RETURN;
  END IF;

  SELECT * INTO v_gift_card
  FROM gift_cards
  WHERE UPPER(code) = UPPER(TRIM(p_code))
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW())
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid gift card code';
  END IF;

  IF v_gift_card.currency <> p_currency THEN
    RAISE EXCEPTION 'Gift card currency mismatch';
  END IF;

  UPDATE gift_cards
    SET balance = balance - p_amount
  WHERE id = v_gift_card.id AND balance >= p_amount
  RETURNING * INTO v_gift_card;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient gift card balance';
  END IF;

  INSERT INTO gift_card_redemptions (
    gift_card_id, booking_id, user_id, amount, currency, status, reserved_at
  ) VALUES (
    v_gift_card.id, p_booking_id, v_uid, p_amount, p_currency, 'reserved', NOW()
  )
  RETURNING * INTO v_redemption;

  RETURN QUERY SELECT v_gift_card.id, v_redemption.id, v_gift_card.balance;
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_gift_card_redemption(text, numeric, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_gift_card_redemption(text, numeric, uuid, text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- F2-22  validate_refund_amount: a booking can never be refunded more than it
--        was paid. Hard-fail when recorded payments exist; keep the WARNING
--        only when nothing was ever recorded (legacy / externally-settled).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_refund_amount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  payment_amount NUMERIC(12, 2);
  total_refunded_for_payment NUMERIC(12, 2);
  booking_total_paid NUMERIC(12, 2);
  payments_total_paid NUMERIC(12, 2);
  new_total_refunded NUMERIC(12, 2);
BEGIN
  IF NEW.payment_id IS NOT NULL THEN
    SELECT amount INTO payment_amount
    FROM booking_payments
    WHERE id = NEW.payment_id;

    IF payment_amount IS NULL THEN
      RAISE EXCEPTION 'Payment with id % does not exist', NEW.payment_id;
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO total_refunded_for_payment
    FROM booking_refunds
    WHERE payment_id = NEW.payment_id
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
      AND status = 'completed';

    IF (total_refunded_for_payment + NEW.amount) > payment_amount + 0.005 THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = format('Refund amount validation failed. Total refunded for payment (%s + %s) = %s exceeds payment amount (%s)',
                        total_refunded_for_payment, NEW.amount, (total_refunded_for_payment + NEW.amount), payment_amount),
        HINT = format('Total refunds for this payment cannot exceed %s. Current refunds: %s, New refund: %s',
                     payment_amount, total_refunded_for_payment, NEW.amount);
    END IF;
  END IF;

  SELECT total_paid INTO booking_total_paid FROM bookings WHERE id = NEW.booking_id;

  SELECT COALESCE(SUM(amount), 0) INTO payments_total_paid
  FROM booking_payments
  WHERE booking_id = NEW.booking_id AND status = 'completed';

  booking_total_paid := GREATEST(COALESCE(booking_total_paid, 0), COALESCE(payments_total_paid, 0));

  SELECT COALESCE(SUM(amount), 0) INTO new_total_refunded
  FROM booking_refunds
  WHERE booking_id = NEW.booking_id
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
    AND status = 'completed';

  new_total_refunded := new_total_refunded + NEW.amount;

  IF booking_total_paid > 0 THEN
    IF new_total_refunded > booking_total_paid + 0.005 THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = format('Refund amount validation failed. Total refunded for booking (%s) exceeds total paid (%s)',
                        new_total_refunded, booking_total_paid),
        HINT = 'Refunds for a booking cannot exceed the amount paid. Check booking_payments and booking_refunds.';
    END IF;
  ELSIF new_total_refunded > 0 THEN
    RAISE WARNING 'Refund % on booking % with no recorded completed payments (total_paid=%). Recorded for reconciliation.',
      NEW.amount, NEW.booking_id, booking_total_paid;
  END IF;

  RETURN NEW;
END;
$function$;

-- -----------------------------------------------------------------------------
-- F4-05 / F2-61 / F2-63 / F2-64 / F2-65 / F2-66 / F2-11 / F2-56
-- Internal, finance-posting and admin functions must only be callable by the
-- service role. No client (mobile or browser) calls RPCs directly — every RPC
-- goes through the Next.js server (audit/04-test-results.md §1, scan of
-- apps/provider, apps/customer, apps/web components: 0 client-side .rpc calls).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_names text[] := ARRAY[
    -- F2-61
    'post_gateway_fee_delta',
    -- F2-63
    'recognize_period_revenue', 'recognize_ads_spend_delta', 'ads_recognize_on_spent_update',
    -- F2-64
    'void_gift_card_redemption_for_sale', 'capture_gift_card_redemption_for_sale', 'reserve_gift_card_redemption_for_sale',
    -- F2-65
    'brand_reset_tenant_data',
    -- F2-66
    'revoke_all_user_sessions', 'revoke_user_sessions_by_ids', 'brand_clear_user_references', 'claim_cron_run', 'finish_cron_run',
    -- F2-11
    'log_finance_ledger_trigger_failure', '_shadow_replay_membership_gift_card_row', '_shadow_replay_gateway_fee_adjustment_row',
    -- F2-56
    'recognize_gift_card_breakage',
    -- other SECURITY DEFINER internals with no client caller (trigger bodies, server-only helpers)
    'get_provider_session_security', 'guard_booking_status_transition', 'guard_users_role_update',
    'set_booking_cancellation_policy_snapshot', 'set_finance_transaction_default_currency',
    'snapshot_booking_commission_percentage', 'support_tickets_set_tenant_id_before_insert',
    'sync_provider_ops_case_booking_stats', 'trg_bookings_sync_provider_ops_case_stats',
    'product_orders_release_gift_card_on_cancel', 'with_zoho_connection_lock',
    'finance_audit_run', 'wallet_credit_admin', 'credit_marketing_credit', 'debit_marketing_credit',
    'recompute_journal_for_finance_tx', 'revert_journal_for_finance_tx'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (v_names)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', r.proname, r.args);
  END LOOP;
END $$;

-- Future functions created by the migration runner no longer get EXECUTE for
-- anon or PUBLIC by default. `authenticated` keeps the hosted default because
-- RLS helper functions are evaluated as the querying role; functions that must
-- be server-only must REVOKE explicitly (template at the end of this file).
DO $$
BEGIN
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC', current_user);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon', current_user);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not alter default privileges for %: %', current_user, SQLERRM;
END $$;

-- -----------------------------------------------------------------------------
-- F3-01 / F3-21  value-range CHECKs (NOT VALID first so existing rows never
-- block the deploy; validated immediately when the data is clean).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('products',          'products_retail_price_nonneg_chk',        'retail_price IS NULL OR (retail_price >= 0 AND retail_price <= 1000000)'),
      ('products',          'products_supply_price_nonneg_chk',        'supply_price IS NULL OR (supply_price >= 0 AND supply_price <= 1000000)'),
      ('products',          'products_markup_nonneg_chk',              'markup IS NULL OR markup >= 0'),
      ('products',          'products_tax_rate_range_chk',             'tax_rate IS NULL OR (tax_rate >= 0 AND tax_rate <= 100)'),
      ('product_variants',  'product_variants_retail_price_nonneg_chk','retail_price IS NULL OR (retail_price >= 0 AND retail_price <= 1000000)'),
      ('product_variants',  'product_variants_supply_price_nonneg_chk','supply_price IS NULL OR (supply_price >= 0 AND supply_price <= 1000000)'),
      ('provider_staff',    'provider_staff_commission_rate_range_chk','commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 100)'),
      ('provider_staff',    'provider_staff_commission_pct_range_chk', 'commission_percentage IS NULL OR (commission_percentage >= 0 AND commission_percentage <= 100)'),
      ('provider_staff',    'provider_staff_service_commission_range_chk', 'service_commission_rate IS NULL OR (service_commission_rate >= 0 AND service_commission_rate <= 100)'),
      ('provider_staff',    'provider_staff_product_commission_range_chk', 'product_commission_rate IS NULL OR (product_commission_rate >= 0 AND product_commission_rate <= 100)')
    ) AS t(tbl, cname, expr)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = c.tbl
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = c.cname
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%s) NOT VALID', c.tbl, c.cname, c.expr);
      BEGIN
        EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', c.tbl, c.cname);
      EXCEPTION WHEN check_violation THEN
        RAISE WARNING 'Constraint % on % left NOT VALID: existing rows violate it (%). Clean up and run VALIDATE CONSTRAINT.', c.cname, c.tbl, SQLERRM;
      END;
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- F2-03 / F2-04 / F2-29  idempotency uniqueness
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS booking_payments_stripe_flw_provider_tx_uidx
      ON public.booking_payments (payment_provider, payment_provider_id)
      WHERE payment_provider IN ('stripe', 'flutterwave')
        AND payment_provider_id IS NOT NULL
        AND btrim(payment_provider_id) <> '';
  EXCEPTION WHEN unique_violation THEN
    RAISE WARNING 'booking_payments has duplicate stripe/flutterwave payment_provider_id rows; index not created (F2-03). De-duplicate then re-run.';
  END;

  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS provider_yoco_webhook_events_webhook_id_uidx
      ON public.provider_yoco_webhook_events (webhook_id)
      WHERE webhook_id IS NOT NULL AND btrim(webhook_id) <> '';
  EXCEPTION WHEN unique_violation THEN
    RAISE WARNING 'provider_yoco_webhook_events has duplicate webhook_id rows; index not created (F2-04).';
  END;

  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS booking_refunds_refund_provider_id_uidx
      ON public.booking_refunds (refund_provider_id)
      WHERE refund_provider_id IS NOT NULL AND btrim(refund_provider_id) <> '';
  EXCEPTION WHEN unique_violation THEN
    RAISE WARNING 'booking_refunds has duplicate refund_provider_id rows; index not created (F2-29).';
  END;
END $$;

-- -----------------------------------------------------------------------------
-- Template for future server-only functions (copy below every CREATE FUNCTION
-- that must not be reachable with a user JWT):
--   REVOKE ALL ON FUNCTION public.fn(args) FROM PUBLIC, anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.fn(args) TO service_role;
-- -----------------------------------------------------------------------------
