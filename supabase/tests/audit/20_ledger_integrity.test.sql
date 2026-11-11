-- Tests for 10139_audit_ledger_integrity.sql
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/audit/20_ledger_integrity.test.sql
\set ON_ERROR_STOP on
BEGIN;
\ir 00_fixture.sql

-- Component net for a booking (tax uses amount; everything else net), by refund_component/transaction_type.
CREATE OR REPLACE FUNCTION pg_temp.component_net(p_booking uuid, p_component text)
RETURNS numeric LANGUAGE sql AS $$
  SELECT COALESCE(SUM(CASE WHEN p_component = 'tax' THEN COALESCE(amount,0) ELSE COALESCE(net,0) END), 0)
    FROM public.finance_transactions
   WHERE booking_id = p_booking
     AND COALESCE(refund_component, transaction_type) = p_component;
$$;

-- =============================================================================
-- F2-06  two partial refunds (100 + 233.33) on a 333.33 cash payment net every component to 0
--        (before the fix: platform_fee +2.42, provider_earnings −9.12, tax +6.70)
-- =============================================================================
SELECT pg_temp.audit_booking('60000000-0000-4000-8000-000000000021');
INSERT INTO public.booking_payments (id, booking_id, amount, payment_method, payment_provider, status, tenant_id)
VALUES ('70000000-0000-4000-8000-000000000021','60000000-0000-4000-8000-000000000021', 333.33, 'cash', 'cash', 'completed', '10000000-0000-4000-8000-000000000001');

DO $$
BEGIN
  PERFORM pg_temp.audit_assert(pg_temp.component_net('60000000-0000-4000-8000-000000000021','platform_fee') = 15.00, 'F2-06 setup: platform_fee 15.00 posted');
  PERFORM pg_temp.audit_assert(pg_temp.component_net('60000000-0000-4000-8000-000000000021','tax') = 41.52, 'F2-06 setup: tax 41.52 posted');
  PERFORM pg_temp.audit_assert(pg_temp.component_net('60000000-0000-4000-8000-000000000021','provider_earnings') = 276.81, 'F2-06 setup: provider_earnings 276.81 posted');
END $$;

INSERT INTO public.booking_refunds (id, booking_id, amount, reason, refund_method, status)
VALUES ('80000000-0000-4000-8000-000000000021','60000000-0000-4000-8000-000000000021', 100.00, 'partial 1', 'cash', 'completed');
DO $$
DECLARE v_pf numeric; v_pe numeric; v_tax numeric; v_cash numeric;
BEGIN
  v_pf := pg_temp.component_net('60000000-0000-4000-8000-000000000021','platform_fee');
  v_pe := pg_temp.component_net('60000000-0000-4000-8000-000000000021','provider_earnings');
  v_tax := pg_temp.component_net('60000000-0000-4000-8000-000000000021','tax');
  -- 100/333.33 of each component reversed
  PERFORM pg_temp.audit_assert(v_pf = 10.50, format('F2-06 after 100.00: platform_fee remaining 10.50 (got %s)', v_pf));
  PERFORM pg_temp.audit_assert(v_tax = 29.06, format('F2-06 after 100.00: tax remaining 29.06 (got %s)', v_tax));
  SELECT COALESCE(SUM(net),0) INTO v_cash FROM public.finance_transactions
   WHERE source_refund_id = '80000000-0000-4000-8000-000000000021'
     AND refund_component IN ('provider_earnings','platform_fee','tax','payment','tip','travel_fee','cancellation_fee');
  -- tax reversal rows carry the cash leg in amount (net = 0)
  SELECT v_cash + COALESCE((SELECT SUM(amount) FROM public.finance_transactions WHERE source_refund_id = '80000000-0000-4000-8000-000000000021' AND refund_component='tax'),0) INTO v_cash;
  PERFORM pg_temp.audit_assert(v_cash = -100.00, format('F2-06 after 100.00: cash reversal sums to -100.00 (got %s)', v_cash));
END $$;

INSERT INTO public.booking_refunds (id, booking_id, amount, reason, refund_method, status)
VALUES ('80000000-0000-4000-8000-000000000022','60000000-0000-4000-8000-000000000021', 233.33, 'partial 2', 'cash', 'completed');
DO $$
DECLARE v_pf numeric; v_pe numeric; v_tax numeric; v_tr numeric;
BEGIN
  v_pf := pg_temp.component_net('60000000-0000-4000-8000-000000000021','platform_fee');
  v_pe := pg_temp.component_net('60000000-0000-4000-8000-000000000021','provider_earnings');
  v_tax := pg_temp.component_net('60000000-0000-4000-8000-000000000021','tax');
  SELECT total_refunded INTO v_tr FROM public.bookings WHERE id = '60000000-0000-4000-8000-000000000021';
  PERFORM pg_temp.audit_assert(v_tr = 333.33, 'F2-06 fully refunded (total_refunded 333.33)');
  PERFORM pg_temp.audit_assert(v_pf = 0, format('F2-06 fully refunded: platform_fee nets to 0 (got %s)', v_pf));
  PERFORM pg_temp.audit_assert(v_pe = 0, format('F2-06 fully refunded: provider_earnings nets to 0 (got %s)', v_pe));
  PERFORM pg_temp.audit_assert(v_tax = 0, format('F2-06 fully refunded: tax nets to 0 (got %s)', v_tax));
END $$;

-- three equal refunds (3 × 111.11)
SELECT pg_temp.audit_booking('60000000-0000-4000-8000-000000000023');
INSERT INTO public.booking_payments (id, booking_id, amount, payment_method, payment_provider, status, tenant_id)
VALUES ('70000000-0000-4000-8000-000000000023','60000000-0000-4000-8000-000000000023', 333.33, 'cash', 'cash', 'completed', '10000000-0000-4000-8000-000000000001');
INSERT INTO public.booking_refunds (booking_id, amount, reason, refund_method, status) VALUES ('60000000-0000-4000-8000-000000000023', 111.11, 't1', 'cash', 'completed');
INSERT INTO public.booking_refunds (booking_id, amount, reason, refund_method, status) VALUES ('60000000-0000-4000-8000-000000000023', 111.11, 't2', 'cash', 'completed');
INSERT INTO public.booking_refunds (booking_id, amount, reason, refund_method, status) VALUES ('60000000-0000-4000-8000-000000000023', 111.11, 't3', 'cash', 'completed');
DO $$
DECLARE v_pf numeric; v_pe numeric; v_tax numeric;
BEGIN
  v_pf := pg_temp.component_net('60000000-0000-4000-8000-000000000023','platform_fee');
  v_pe := pg_temp.component_net('60000000-0000-4000-8000-000000000023','provider_earnings');
  v_tax := pg_temp.component_net('60000000-0000-4000-8000-000000000023','tax');
  PERFORM pg_temp.audit_assert(v_pf = 0 AND v_pe = 0 AND v_tax = 0, format('F2-06 3×111.11: all components net to 0 (pf %s, pe %s, tax %s)', v_pf, v_pe, v_tax));
END $$;

-- =============================================================================
-- F4-07  reconciliation sees the residuals when they exist (synthetic drift) and is clean otherwise
-- =============================================================================
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.reconciliation_booking_component_drift()
   WHERE booking_id IN ('60000000-0000-4000-8000-000000000021','60000000-0000-4000-8000-000000000023');
  PERFORM pg_temp.audit_assert(v_n = 0, 'F4-07 no component drift on correctly refunded bookings');
END $$;
-- inject a residual directly and check detection
INSERT INTO public.finance_transactions (tenant_id, booking_id, provider_id, transaction_type, amount, fees, commission, net, description)
VALUES ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000021','30000000-0000-4000-8000-000000000001','provider_earnings', 9.12, 0, 0, 9.12, 'synthetic drift');
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.reconciliation_booking_component_drift()
   WHERE booking_id = '60000000-0000-4000-8000-000000000021' AND component = 'provider_earnings' AND residual = 9.12;
  PERFORM pg_temp.audit_assert(v_n = 1, 'F4-07 component drift detected');
  BEGIN
    PERFORM * FROM public.reconciliation_assert_booking_integrity();
    RAISE EXCEPTION 'FAIL: F4-07 assert did not raise on drift';
  EXCEPTION WHEN SQLSTATE '40000' THEN
    PERFORM pg_temp.audit_assert(true, 'F4-07 reconciliation_assert_booking_integrity raises on drift');
  END;
END $$;
DELETE FROM public.finance_transactions WHERE description = 'synthetic drift';

-- =============================================================================
-- F2-51 / F2-54  deleting or cancelling a completed refund removes its ledger reversals
-- =============================================================================
SELECT pg_temp.audit_booking('60000000-0000-4000-8000-000000000024');
INSERT INTO public.booking_payments (id, booking_id, amount, payment_method, payment_provider, status, tenant_id)
VALUES ('70000000-0000-4000-8000-000000000024','60000000-0000-4000-8000-000000000024', 333.33, 'cash', 'cash', 'completed', '10000000-0000-4000-8000-000000000001');
INSERT INTO public.booking_refunds (id, booking_id, amount, reason, refund_method, status)
VALUES ('80000000-0000-4000-8000-000000000024','60000000-0000-4000-8000-000000000024', 50.00, 'to delete', 'cash', 'completed');
INSERT INTO public.booking_refunds (id, booking_id, amount, reason, refund_method, status)
VALUES ('80000000-0000-4000-8000-000000000025','60000000-0000-4000-8000-000000000024', 50.00, 'to cancel', 'cash', 'completed');
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.finance_transactions WHERE source_refund_id IN ('80000000-0000-4000-8000-000000000024','80000000-0000-4000-8000-000000000025');
  PERFORM pg_temp.audit_assert(v_n >= 4, 'F2-51 setup: reversal rows posted for both refunds');
END $$;
DELETE FROM public.booking_refunds WHERE id = '80000000-0000-4000-8000-000000000024';
UPDATE public.booking_refunds SET status = 'cancelled' WHERE id = '80000000-0000-4000-8000-000000000025';
DO $$
DECLARE v_n int; v_orph int; v_pe numeric; v_tr numeric;
BEGIN
  SELECT count(*) INTO v_n FROM public.finance_transactions WHERE source_refund_id IN ('80000000-0000-4000-8000-000000000024','80000000-0000-4000-8000-000000000025');
  PERFORM pg_temp.audit_assert(v_n = 0, 'F2-51/F2-54 reversal rows removed after DELETE and cancel');
  SELECT count(*) INTO v_orph FROM public.reconciliation_orphan_refund_rows() WHERE booking_id = '60000000-0000-4000-8000-000000000024';
  PERFORM pg_temp.audit_assert(v_orph = 0, 'F4-07 no orphan refund rows after removal');
  v_pe := pg_temp.component_net('60000000-0000-4000-8000-000000000024','provider_earnings');
  SELECT total_refunded INTO v_tr FROM public.bookings WHERE id = '60000000-0000-4000-8000-000000000024';
  PERFORM pg_temp.audit_assert(v_pe = 276.81 AND v_tr = 0, format('F2-51 ledger (%s) and booking (%s refunded) agree again', v_pe, v_tr));
  -- GL: reversal journal entries exist for the removed rows
  SELECT count(*) INTO v_n FROM public.journal_entries WHERE source = 'finance_transactions_reversal';
  PERFORM pg_temp.audit_assert(v_n >= 1, 'F2-51 GL reversal entries posted for removed ledger rows');
END $$;

-- =============================================================================
-- F2-14  provider-sourced booking paid in cash posts no platform_fee row
-- =============================================================================
SELECT pg_temp.audit_booking('60000000-0000-4000-8000-000000000026', 'provider');
INSERT INTO public.booking_payments (id, booking_id, amount, payment_method, payment_provider, status, tenant_id)
VALUES ('70000000-0000-4000-8000-000000000026','60000000-0000-4000-8000-000000000026', 333.33, 'cash', 'cash', 'completed', '10000000-0000-4000-8000-000000000001');
DO $$
DECLARE v_pf numeric; v_pe numeric;
BEGIN
  v_pf := pg_temp.component_net('60000000-0000-4000-8000-000000000026','platform_fee');
  v_pe := pg_temp.component_net('60000000-0000-4000-8000-000000000026','provider_earnings');
  PERFORM pg_temp.audit_assert(v_pf = 0, format('F2-14 no platform_fee on provider-sourced booking (got %s)', v_pf));
  PERFORM pg_temp.audit_assert(v_pe = 291.81, format('F2-14 provider earnings not reduced by fee: 333.33 - 41.52 = 291.81 (got %s)', v_pe));
END $$;

-- =============================================================================
-- F2-31  ledger failure rolls the payment back (fail-closed)
-- =============================================================================
SELECT pg_temp.audit_booking('60000000-0000-4000-8000-000000000027');
CREATE OR REPLACE FUNCTION pg_temp.audit_break_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.booking_id = '60000000-0000-4000-8000-000000000027' THEN
    RAISE EXCEPTION 'audit fault injection';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aaaa_audit_break_ledger BEFORE INSERT ON public.finance_transactions FOR EACH ROW EXECUTE FUNCTION pg_temp.audit_break_ledger();
DO $$
DECLARE v_n int;
BEGIN
  BEGIN
    INSERT INTO public.booking_payments (id, booking_id, amount, payment_method, payment_provider, status, tenant_id)
    VALUES ('70000000-0000-4000-8000-000000000027','60000000-0000-4000-8000-000000000027', 333.33, 'cash', 'cash', 'completed', '10000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'FAIL: F2-31 payment committed although ledger posting failed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    PERFORM pg_temp.audit_assert(SQLERRM LIKE 'finance ledger posting failed%', 'F2-31 payment insert rejected when ledger fails');
  END;
  SELECT count(*) INTO v_n FROM public.booking_payments WHERE id = '70000000-0000-4000-8000-000000000027';
  PERFORM pg_temp.audit_assert(v_n = 0, 'F2-31 no payment row persisted');
END $$;
DROP TRIGGER aaaa_audit_break_ledger ON public.finance_transactions;

-- =============================================================================
-- F2-07  tip allocations sum exactly to the tip (3-way split of 100.00)
-- =============================================================================
INSERT INTO public.provider_tip_settings (provider_id, distribute_to_staff) VALUES ('30000000-0000-4000-8000-000000000001', true)
ON CONFLICT (provider_id) DO UPDATE SET distribute_to_staff = true;
INSERT INTO public.provider_staff (id, provider_id, user_id, name, email, role, is_active, permissions)
VALUES ('40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001', NULL, 'Audit Staff C','audit-staff-c@example.invalid','employee',true,'{}')
ON CONFLICT (id) DO NOTHING;
SELECT pg_temp.audit_booking('60000000-0000-4000-8000-000000000028');
INSERT INTO public.booking_services (booking_id, offering_id, staff_id, price, currency, duration_minutes, scheduled_start_at, scheduled_end_at)
VALUES
 ('60000000-0000-4000-8000-000000000028','50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001', 100, 'ZAR', 60, now() + interval '1 day', now() + interval '1 day 1 hour'),
 ('60000000-0000-4000-8000-000000000028','50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002', 100, 'ZAR', 60, now() + interval '1 day', now() + interval '1 day 1 hour'),
 ('60000000-0000-4000-8000-000000000028','50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003', 100, 'ZAR', 60, now() + interval '1 day', now() + interval '1 day 1 hour');
INSERT INTO public.finance_transactions (tenant_id, booking_id, provider_id, transaction_type, amount, fees, commission, net, description)
VALUES ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000028','30000000-0000-4000-8000-000000000001','tip', 100.00, 0, 0, 100.00, 'audit tip');
DO $$
DECLARE v_sum numeric; v_n int;
BEGIN
  SELECT COALESCE(SUM(amount),0), count(*) INTO v_sum, v_n FROM public.booking_tip_allocations WHERE booking_id = '60000000-0000-4000-8000-000000000028';
  PERFORM pg_temp.audit_assert(v_n = 3, format('F2-07 three allocations (got %s)', v_n));
  PERFORM pg_temp.audit_assert(v_sum = 100.00, format('F2-07 allocations sum to 100.00 (got %s)', v_sum));
END $$;

-- =============================================================================
-- F2-53  tip allocations trigger fires before staff earnings lines trigger
-- =============================================================================
DO $$
DECLARE v_tip text; v_lines text;
BEGIN
  SELECT tgname INTO v_tip FROM pg_trigger WHERE tgrelid = 'public.finance_transactions'::regclass AND tgfoid = 'public.create_tip_allocations_on_tip_transaction'::regproc;
  SELECT tgname INTO v_lines FROM pg_trigger WHERE tgrelid = 'public.finance_transactions'::regclass AND tgfoid = 'public.create_staff_earnings_lines_on_finance_tx'::regproc;
  PERFORM pg_temp.audit_assert(v_tip < v_lines, format('F2-53 trigger order: %s fires before %s', v_tip, v_lines));
END $$;

-- =============================================================================
-- F2-12  invalid status transition by a user session is rejected
-- =============================================================================
SELECT pg_temp.audit_booking('60000000-0000-4000-8000-000000000029');
UPDATE public.bookings SET status = 'completed' WHERE id = '60000000-0000-4000-8000-000000000029';
-- grant the owner direct UPDATE for this probe only (API normally uses service role)
GRANT UPDATE ON public.bookings TO authenticated;
CREATE POLICY audit_probe_owner_update ON public.bookings FOR UPDATE USING (provider_id = '30000000-0000-4000-8000-000000000001') WITH CHECK (true);
SELECT pg_temp.audit_as('authenticated', '20000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    UPDATE public.bookings SET status = 'pending' WHERE id = '60000000-0000-4000-8000-000000000029';
    RAISE EXCEPTION 'FAIL: F2-12 completed -> pending accepted for user session';
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.audit_assert(true, 'F2-12 invalid transition rejected for user session');
  END;
END $$;
RESET ROLE;

-- =============================================================================
-- T1.10  a retained cancellation fee is the unrefunded sale, not a second row.
--        333.33 paid, 283.33 refunded, 50.00 kept. Recognized components sum to 50.00.
-- =============================================================================
SELECT pg_temp.audit_booking('60000000-0000-4000-8000-000000000041');
INSERT INTO public.booking_payments (id, booking_id, amount, payment_method, payment_provider, status, tenant_id)
VALUES ('70000000-0000-4000-8000-000000000041','60000000-0000-4000-8000-000000000041', 333.33, 'cash', 'cash', 'completed', '10000000-0000-4000-8000-000000000001');
INSERT INTO public.booking_refunds (id, booking_id, amount, reason, refund_method, status)
VALUES ('80000000-0000-4000-8000-000000000041','60000000-0000-4000-8000-000000000041', 283.33, 'cancel keep 50', 'cash', 'completed');
DO $$
DECLARE v_keep numeric;
BEGIN
  v_keep := pg_temp.component_net('60000000-0000-4000-8000-000000000041','provider_earnings')
          + pg_temp.component_net('60000000-0000-4000-8000-000000000041','platform_fee')
          + pg_temp.component_net('60000000-0000-4000-8000-000000000041','tax')
          + pg_temp.component_net('60000000-0000-4000-8000-000000000041','cancellation_fee');
  PERFORM pg_temp.audit_assert(v_keep = 50.00, format('T1.10 retained components = 50.00 (got %s)', v_keep));
END $$;

-- =============================================================================
-- T4.1  a second Paystack capture with the same gateway transaction id is rejected.
--        There is no ux_booking_payments_idempotency index and no idempotency_key
--        column. The control is booking_payments_paystack_provider_tx_uidx.
-- =============================================================================
SELECT pg_temp.audit_booking('60000000-0000-4000-8000-000000000030');
INSERT INTO public.booking_payments (id, booking_id, amount, payment_method, payment_provider, payment_provider_id, status, tenant_id)
VALUES ('70000000-0000-4000-8000-000000000030','60000000-0000-4000-8000-000000000030', 333.33, 'card', 'paystack', 'audit-tx-030', 'completed', '10000000-0000-4000-8000-000000000001');
DO $$
DECLARE v_n int;
BEGIN
  BEGIN
    INSERT INTO public.booking_payments (id, booking_id, amount, payment_method, payment_provider, payment_provider_id, status, tenant_id)
    VALUES ('70000000-0000-4000-8000-000000000031','60000000-0000-4000-8000-000000000030', 333.33, 'card', 'paystack', 'audit-tx-030', 'completed', '10000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'FAIL: T4.1 duplicate Paystack transaction id accepted';
  EXCEPTION WHEN unique_violation THEN
    PERFORM pg_temp.audit_assert(true, 'T4.1 duplicate Paystack transaction id rejected');
  END;
  SELECT count(*) INTO v_n FROM public.booking_payments WHERE payment_provider_id = 'audit-tx-030';
  PERFORM pg_temp.audit_assert(v_n = 1, format('T4.1 one payment row (got %s)', v_n));
END $$;

ROLLBACK;
\echo 20_ledger_integrity: ALL PASS
