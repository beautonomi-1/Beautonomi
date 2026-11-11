-- Tests for 10138_audit_security_hardening.sql
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/audit/10_security_hardening.test.sql
-- Every assertion raises on failure; the whole file is rolled back.
\set ON_ERROR_STOP on
BEGIN;
\ir 00_fixture.sql

-- =============================================================================
-- F4-02  payout request RPC works (text -> payout_status)
-- =============================================================================
DO $$
DECLARE v_status text;
BEGIN
  SELECT status::text INTO v_status
  FROM public.insert_payout_request_guarded(
    '30000000-0000-4000-8000-000000000001', 1000,
    '{"amount": 100, "payout_number": "PO-AUDIT-1", "payout_method": "bank_transfer"}'::jsonb);
  PERFORM pg_temp.audit_assert(v_status = 'pending', 'F4-02 payout request inserted with status pending');
END $$;

DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.insert_payout_request_guarded(
      '30000000-0000-4000-8000-000000000001', 1000,
      '{"amount": 10, "payout_number": "PO-AUDIT-2", "status": "completed"}'::jsonb);
    RAISE EXCEPTION 'FAIL: F4-02 non-pending status accepted';
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.audit_assert(SQLERRM LIKE '%INVALID_STATUS%', 'F4-02 non-pending status rejected');
  END;
END $$;

-- =============================================================================
-- F4-03  payment-linked refund completes and posts reversal rows
-- =============================================================================
SELECT pg_temp.audit_booking('60000000-0000-4000-8000-000000000011');
INSERT INTO public.booking_payments (id, booking_id, amount, payment_method, payment_provider, payment_provider_id, status, tenant_id)
VALUES ('70000000-0000-4000-8000-000000000011','60000000-0000-4000-8000-000000000011', 333.33, 'card', 'yoco', 'audit-yoco-1', 'completed', '10000000-0000-4000-8000-000000000001');

INSERT INTO public.booking_refunds (id, booking_id, payment_id, amount, reason, refund_method, status)
VALUES ('80000000-0000-4000-8000-000000000011','60000000-0000-4000-8000-000000000011','70000000-0000-4000-8000-000000000011', 50.00, 'audit linked refund', 'original', 'pending');
UPDATE public.booking_refunds SET status = 'completed' WHERE id = '80000000-0000-4000-8000-000000000011';

DO $$
DECLARE v_rows int; v_cash numeric; v_status text;
BEGIN
  SELECT count(*), coalesce(sum(net),0) INTO v_rows, v_cash
  FROM public.finance_transactions
  WHERE source_refund_id = '80000000-0000-4000-8000-000000000011'
    AND refund_component IN ('provider_earnings','platform_fee','tax','tip','travel_fee','cancellation_fee');
  SELECT status INTO v_status FROM public.booking_refunds WHERE id = '80000000-0000-4000-8000-000000000011';
  PERFORM pg_temp.audit_assert(v_status = 'completed', 'F4-03 linked refund reached completed');
  PERFORM pg_temp.audit_assert(v_rows >= 2, 'F4-03 linked refund posted component reversal rows');
END $$;

-- The non-refund uniqueness from 489 still holds.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.finance_transactions (tenant_id, booking_id, provider_id, source_payment_id, transaction_type, amount, fees, commission, net, description)
    VALUES ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000011','provider_earnings', 1, 0, 0, 1, 'dup probe');
    RAISE EXCEPTION 'FAIL: F4-03 duplicate (payment, type) non-refund row accepted';
  EXCEPTION WHEN unique_violation THEN
    PERFORM pg_temp.audit_assert(true, 'F4-03 non-refund (payment, type) uniqueness retained');
  END;
END $$;

-- =============================================================================
-- F2-01  staff cannot write booking_refunds through a user JWT
-- =============================================================================
SELECT pg_temp.audit_as('authenticated', '20000000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_n int;
BEGIN
  BEGIN
    INSERT INTO public.booking_refunds (booking_id, amount, reason, refund_method, status)
    VALUES ('60000000-0000-4000-8000-000000000011', 1.00, 'staff probe', 'cash', 'completed');
    RAISE EXCEPTION 'FAIL: F2-01 staff INSERT into booking_refunds allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.audit_assert(true, 'F2-01 staff INSERT denied');
  END;
  BEGIN
    UPDATE public.booking_refunds SET amount = 0.01 WHERE id = '80000000-0000-4000-8000-000000000011';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    PERFORM pg_temp.audit_assert(v_n = 0, 'F2-01 staff UPDATE affected 0 rows');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.audit_assert(true, 'F2-01 staff UPDATE denied');
  END;
  BEGIN
    DELETE FROM public.booking_refunds WHERE id = '80000000-0000-4000-8000-000000000011';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    PERFORM pg_temp.audit_assert(v_n = 0, 'F2-01 staff DELETE affected 0 rows');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.audit_assert(true, 'F2-01 staff DELETE denied');
  END;
  -- read access for staff is retained
  SELECT count(*) INTO v_n FROM public.booking_refunds WHERE booking_id = '60000000-0000-4000-8000-000000000011';
  PERFORM pg_temp.audit_assert(v_n = 1, 'F2-01 staff can still SELECT own provider refunds');
END $$;
RESET ROLE;

-- =============================================================================
-- F2-02  customer cannot update own additional charge
-- =============================================================================
INSERT INTO public.additional_charges (id, booking_id, amount, description, status, requested_by, currency)
VALUES ('a0000000-0000-4000-8000-000000000011','60000000-0000-4000-8000-000000000011', 120.00, 'audit add-on', 'pending', '20000000-0000-4000-8000-000000000001', 'ZAR');

SELECT pg_temp.audit_as('authenticated', '20000000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_n int;
BEGIN
  BEGIN
    UPDATE public.additional_charges SET amount = 0.01, status = 'paid' WHERE id = 'a0000000-0000-4000-8000-000000000011';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    PERFORM pg_temp.audit_assert(v_n = 0, 'F2-02 customer UPDATE affected 0 rows');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.audit_assert(true, 'F2-02 customer UPDATE denied');
  END;
END $$;
RESET ROLE;
DO $$
DECLARE v_amt numeric; v_status text;
BEGIN
  SELECT amount, status INTO v_amt, v_status FROM public.additional_charges WHERE id = 'a0000000-0000-4000-8000-000000000011';
  PERFORM pg_temp.audit_assert(v_amt = 120.00 AND v_status = 'pending', 'F2-02 charge unchanged');
END $$;

-- =============================================================================
-- F2-23  gift card reservation requires booking ownership
-- =============================================================================
SELECT pg_temp.audit_as('authenticated', '20000000-0000-4000-8000-000000000004'); -- customer B
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.reserve_gift_card_redemption('AUDIT-GC-0001', 25, '60000000-0000-4000-8000-000000000011', 'ZAR');
    RAISE EXCEPTION 'FAIL: F2-23 unrelated user reserved against another customer booking';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    PERFORM pg_temp.audit_assert(SQLERRM = 'Invalid gift card code', 'F2-23 unrelated user rejected without booking oracle');
  END;
END $$;
RESET ROLE;

SELECT pg_temp.audit_as('authenticated', '20000000-0000-4000-8000-000000000003'); -- booking customer
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_remaining numeric;
BEGIN
  SELECT remaining_balance INTO v_remaining FROM public.reserve_gift_card_redemption('AUDIT-GC-0001', 25, '60000000-0000-4000-8000-000000000011', 'ZAR');
  PERFORM pg_temp.audit_assert(v_remaining = 175.00, 'F2-23 booking customer can reserve');
END $$;
RESET ROLE;

SELECT pg_temp.audit_booking('60000000-0000-4000-8000-000000000012');
SELECT pg_temp.audit_as('authenticated', '20000000-0000-4000-8000-000000000002'); -- provider staff (mark-paid path)
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_remaining numeric;
BEGIN
  SELECT remaining_balance INTO v_remaining FROM public.reserve_gift_card_redemption('AUDIT-GC-0001', 25, '60000000-0000-4000-8000-000000000012', 'ZAR');
  PERFORM pg_temp.audit_assert(v_remaining = 150.00, 'F2-23 provider staff can reserve for own-provider booking');
END $$;
RESET ROLE;

-- =============================================================================
-- F2-22  unlinked over-refund is rejected
-- =============================================================================
SELECT pg_temp.audit_booking('60000000-0000-4000-8000-000000000013');
INSERT INTO public.booking_payments (id, booking_id, amount, payment_method, payment_provider, status, tenant_id)
VALUES ('70000000-0000-4000-8000-000000000013','60000000-0000-4000-8000-000000000013', 333.33, 'cash', 'cash', 'completed', '10000000-0000-4000-8000-000000000001');
DO $$
BEGIN
  BEGIN
    INSERT INTO public.booking_refunds (booking_id, payment_id, amount, reason, refund_method, status)
    VALUES ('60000000-0000-4000-8000-000000000013', NULL, 400.00, 'over-refund probe', 'cash', 'completed');
    RAISE EXCEPTION 'FAIL: F2-22 unlinked over-refund accepted';
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.audit_assert(true, 'F2-22 unlinked over-refund rejected');
  END;
END $$;
-- exact full refund still allowed
INSERT INTO public.booking_refunds (booking_id, payment_id, amount, reason, refund_method, status)
VALUES ('60000000-0000-4000-8000-000000000013', NULL, 333.33, 'full refund', 'cash', 'completed');
DO $$
DECLARE v_tr numeric;
BEGIN
  SELECT total_refunded INTO v_tr FROM public.bookings WHERE id = '60000000-0000-4000-8000-000000000013';
  PERFORM pg_temp.audit_assert(v_tr = 333.33, 'F2-22 exact full refund accepted');
END $$;

-- =============================================================================
-- F4-05 / F2-61.. grants: server-only functions not executable by anon/authenticated
-- =============================================================================
DO $$
DECLARE r RECORD; v_bad text := '';
BEGIN
  FOR r IN
    SELECT p.proname, p.oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
      'post_gateway_fee_delta','recognize_period_revenue','recognize_ads_spend_delta',
      'void_gift_card_redemption_for_sale','capture_gift_card_redemption_for_sale',
      'brand_reset_tenant_data','revoke_all_user_sessions','revoke_user_sessions_by_ids',
      'brand_clear_user_references','claim_cron_run','finish_cron_run',
      'log_finance_ledger_trigger_failure','recognize_gift_card_breakage',
      'insert_payout_request_guarded','wallet_credit_admin','finance_audit_run'])
  LOOP
    IF has_function_privilege('anon', r.oid, 'EXECUTE') OR has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
      v_bad := v_bad || r.proname || ' ';
    END IF;
    IF NOT has_function_privilege('service_role', r.oid, 'EXECUTE') THEN
      v_bad := v_bad || r.proname || '(no service_role) ';
    END IF;
  END LOOP;
  PERFORM pg_temp.audit_assert(v_bad = '', 'F4-05 server-only functions locked to service_role: ' || v_bad);
END $$;

-- RLS helper functions used in policies remain executable by authenticated.
DO $$
BEGIN
  PERFORM pg_temp.audit_assert(
    has_function_privilege('authenticated', 'public.is_superadmin()', 'EXECUTE'),
    'F4-05 RLS helper is_superadmin still executable by authenticated');
END $$;

-- =============================================================================
-- F3-01 / F3-21  CHECK constraints
-- =============================================================================
DO $$
BEGIN
  BEGIN
    INSERT INTO public.products (provider_id, name, retail_price) VALUES ('30000000-0000-4000-8000-000000000001', 'audit neg', -5);
    RAISE EXCEPTION 'FAIL: F3-01 negative retail_price accepted';
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.audit_assert(true, 'F3-01 negative retail_price rejected');
  END;
  BEGIN
    INSERT INTO public.products (provider_id, name, retail_price, tax_rate) VALUES ('30000000-0000-4000-8000-000000000001', 'audit tax', 10, 150);
    RAISE EXCEPTION 'FAIL: F3-01 tax_rate 150 accepted';
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.audit_assert(true, 'F3-01 tax_rate 150 rejected');
  END;
  BEGIN
    UPDATE public.provider_staff SET service_commission_rate = 250 WHERE id = '40000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'FAIL: F3-21 commission rate 250 accepted';
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.audit_assert(true, 'F3-21 commission rate 250 rejected');
  END;
END $$;

-- =============================================================================
-- F2-03 / F2-29  idempotency uniqueness
-- =============================================================================
SELECT pg_temp.audit_booking('60000000-0000-4000-8000-000000000014');
INSERT INTO public.booking_payments (booking_id, amount, payment_method, payment_provider, payment_provider_id, status, tenant_id)
VALUES ('60000000-0000-4000-8000-000000000014', 333.33, 'card', 'stripe', 'pi_audit_1', 'completed', '10000000-0000-4000-8000-000000000001');
DO $$
BEGIN
  BEGIN
    INSERT INTO public.booking_payments (booking_id, amount, payment_method, payment_provider, payment_provider_id, status, tenant_id)
    VALUES ('60000000-0000-4000-8000-000000000014', 333.33, 'card', 'stripe', 'pi_audit_1', 'completed', '10000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'FAIL: F2-03 duplicate stripe payment accepted';
  EXCEPTION WHEN unique_violation THEN
    PERFORM pg_temp.audit_assert(true, 'F2-03 duplicate stripe payment rejected');
  END;
END $$;
INSERT INTO public.booking_refunds (booking_id, amount, reason, refund_method, status, refund_provider_id)
VALUES ('60000000-0000-4000-8000-000000000014', 10, 'gw refund', 'original', 'completed', 're_audit_1');
DO $$
BEGIN
  BEGIN
    INSERT INTO public.booking_refunds (booking_id, amount, reason, refund_method, status, refund_provider_id)
    VALUES ('60000000-0000-4000-8000-000000000014', 10, 'gw refund dup', 'original', 'completed', 're_audit_1');
    RAISE EXCEPTION 'FAIL: F2-29 duplicate refund_provider_id accepted';
  EXCEPTION WHEN unique_violation THEN
    PERFORM pg_temp.audit_assert(true, 'F2-29 duplicate refund_provider_id rejected');
  END;
END $$;

ROLLBACK;
\echo 10_security_hardening: ALL PASS
