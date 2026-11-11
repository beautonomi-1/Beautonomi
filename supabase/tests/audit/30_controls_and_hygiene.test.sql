-- Tests for 10140_audit_controls_and_hygiene.sql
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/audit/30_controls_and_hygiene.test.sql
\set ON_ERROR_STOP on
BEGIN;
\ir 00_fixture.sql

-- =============================================================================
-- F2-44  issued invoice financial fields are immutable; payment fields are not
-- =============================================================================
INSERT INTO public.provider_invoices (id, provider_id, invoice_number, invoice_type, period_start, period_end, issue_date, due_date,
  subtotal, tax_rate, tax_amount, total_amount, amount_paid, status, currency)
VALUES ('b0000000-0000-4000-8000-000000000031','30000000-0000-4000-8000-000000000001','INV-AUDIT-1','platform_fee',
  current_date - 30, current_date - 1, current_date, current_date + 14, 100.00, 15, 15.00, 115.00, 0, 'draft', 'ZAR');
UPDATE public.provider_invoices SET total_amount = 230.00, subtotal = 200.00, tax_amount = 30.00 WHERE id = 'b0000000-0000-4000-8000-000000000031';
UPDATE public.provider_invoices SET status = 'sent', sent_at = now() WHERE id = 'b0000000-0000-4000-8000-000000000031';
DO $$
BEGIN
  BEGIN
    UPDATE public.provider_invoices SET total_amount = 1.00 WHERE id = 'b0000000-0000-4000-8000-000000000031';
    RAISE EXCEPTION 'FAIL: F2-44 total_amount changed on a sent invoice';
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.audit_assert(true, 'F2-44 sent invoice total immutable');
  END;
  UPDATE public.provider_invoices SET status = 'paid', amount_paid = 230.00, paid_at = now(), payment_reference = 'audit-ref'
   WHERE id = 'b0000000-0000-4000-8000-000000000031';
  PERFORM pg_temp.audit_assert(true, 'F2-44 payment recording still allowed');
  UPDATE public.provider_invoices SET notes = 'paid by EFT' WHERE id = 'b0000000-0000-4000-8000-000000000031';
  PERFORM pg_temp.audit_assert(true, 'F2-44 notes still editable');
END $$;

-- =============================================================================
-- F2-49  period locks apply to DELETE, journal_*, payouts, payment_transactions and NULL-tenant rows
-- =============================================================================
SELECT pg_temp.audit_booking('60000000-0000-4000-8000-000000000032');
INSERT INTO public.booking_payments (id, booking_id, amount, payment_method, payment_provider, status, tenant_id, created_at)
VALUES ('70000000-0000-4000-8000-000000000032','60000000-0000-4000-8000-000000000032', 333.33, 'cash', 'cash', 'completed', '10000000-0000-4000-8000-000000000001', now() - interval '40 days');
UPDATE public.finance_transactions SET created_at = now() - interval '40 days' WHERE booking_id = '60000000-0000-4000-8000-000000000032';
UPDATE public.journal_entries SET posted_at = now() - interval '40 days' WHERE booking_id = '60000000-0000-4000-8000-000000000032';
INSERT INTO public.financial_period_locks (tenant_id, period_start, period_end, notes)
VALUES ('10000000-0000-4000-8000-000000000001', (now() - interval '60 days')::date, (now() - interval '30 days')::date, 'audit lock');

DO $$
DECLARE v_tx uuid; v_entry uuid; v_n int;
BEGIN
  SELECT id INTO v_tx FROM public.finance_transactions WHERE booking_id = '60000000-0000-4000-8000-000000000032' LIMIT 1;
  SELECT id INTO v_entry FROM public.journal_entries WHERE booking_id = '60000000-0000-4000-8000-000000000032' LIMIT 1;

  BEGIN
    DELETE FROM public.booking_payments WHERE id = '70000000-0000-4000-8000-000000000032';
    RAISE EXCEPTION 'FAIL: F2-49 DELETE of locked payment allowed';
  EXCEPTION WHEN SQLSTATE '22000' THEN
    PERFORM pg_temp.audit_assert(true, 'F2-49 DELETE blocked in locked period (booking_payments)');
  END;

  BEGIN
    DELETE FROM public.finance_transactions WHERE id = v_tx;
    RAISE EXCEPTION 'FAIL: F2-49 DELETE of locked ledger row allowed';
  EXCEPTION WHEN SQLSTATE '22000' THEN
    PERFORM pg_temp.audit_assert(true, 'F2-49 DELETE blocked in locked period (finance_transactions)');
  END;

  IF v_entry IS NOT NULL THEN
    BEGIN
      UPDATE public.journal_entries SET description = 'tamper' WHERE id = v_entry;
      RAISE EXCEPTION 'FAIL: F2-49 UPDATE of locked journal entry allowed';
    EXCEPTION WHEN SQLSTATE '22000' THEN
      PERFORM pg_temp.audit_assert(true, 'F2-49 journal_entries locked');
    END;
    BEGIN
      DELETE FROM public.journal_lines WHERE entry_id = v_entry;
      RAISE EXCEPTION 'FAIL: F2-49 DELETE of locked journal lines allowed';
    EXCEPTION WHEN SQLSTATE '22000' THEN
      PERFORM pg_temp.audit_assert(true, 'F2-49 journal_lines locked via entry');
    END;
  END IF;

  -- NULL-tenant ledger row resolves tenant through the booking
  BEGIN
    INSERT INTO public.finance_transactions (tenant_id, booking_id, provider_id, transaction_type, amount, fees, commission, net, description, created_at)
    VALUES (NULL, '60000000-0000-4000-8000-000000000032', '30000000-0000-4000-8000-000000000001', 'manual_adjustment', 1, 0, 0, 1, 'backdated', now() - interval '40 days');
    RAISE EXCEPTION 'FAIL: F2-49 NULL-tenant backdated insert allowed';
  EXCEPTION WHEN SQLSTATE '22000' THEN
    PERFORM pg_temp.audit_assert(true, 'F2-49 NULL-tenant row resolved via booking and blocked');
  END;

  -- payouts
  BEGIN
    INSERT INTO public.payouts (provider_id, payout_number, amount, currency, status, payout_method, net_amount, created_at)
    VALUES ('30000000-0000-4000-8000-000000000001', 'PO-AUDIT-LOCK', 10, 'ZAR', 'pending', 'bank_transfer', 10, now() - interval '40 days');
    RAISE EXCEPTION 'FAIL: F2-49 backdated payout insert allowed';
  EXCEPTION WHEN SQLSTATE '22000' THEN
    PERFORM pg_temp.audit_assert(true, 'F2-49 payouts locked (tenant via provider)');
  END;

  -- current-period writes still work
  INSERT INTO public.finance_transactions (tenant_id, booking_id, provider_id, transaction_type, amount, fees, commission, net, description)
  VALUES ('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000032', '30000000-0000-4000-8000-000000000001', 'manual_adjustment', 1, 0, 0, 1, 'current period ok');
  PERFORM pg_temp.audit_assert(true, 'F2-49 current-period write allowed');
END $$;
DELETE FROM public.financial_period_locks WHERE notes = 'audit lock';

-- =============================================================================
-- F2-45  reversal journal entry keeps the source reporting currency
-- =============================================================================
DO $$
DECLARE v_tx uuid; v_src uuid; v_cur text;
BEGIN
  INSERT INTO public.finance_transactions (tenant_id, booking_id, provider_id, transaction_type, amount, fees, commission, net, description, currency)
  VALUES ('10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000032', '30000000-0000-4000-8000-000000000001', 'manual_adjustment', 5, 0, 0, 5, 'usd row', 'USD')
  RETURNING id INTO v_tx;
  SELECT id INTO v_src FROM public.journal_entries WHERE source = 'finance_transactions' AND external_ref = v_tx::text LIMIT 1;
  IF v_src IS NULL THEN
    RAISE NOTICE 'SKIP: F2-45 no shadow journal entry posted for manual_adjustment in this build';
  ELSE
    UPDATE public.journal_entries SET reporting_currency = 'USD' WHERE id = v_src;
    PERFORM public.revert_journal_for_finance_tx(v_tx);
    SELECT reporting_currency INTO v_cur FROM public.journal_entries WHERE source = 'finance_transactions_reversal' AND external_ref = v_tx::text;
    PERFORM pg_temp.audit_assert(v_cur = 'USD', format('F2-45 reversal currency follows source (got %s)', v_cur));
    -- idempotent
    PERFORM public.revert_journal_for_finance_tx(v_tx);
    PERFORM pg_temp.audit_assert((SELECT count(*) FROM public.journal_entries WHERE source = 'finance_transactions_reversal' AND external_ref = v_tx::text) = 1, 'F2-45 reversal is idempotent');
  END IF;
END $$;

-- =============================================================================
-- F2-40  recompute routes through the dispatcher (same entry set as the trigger)
-- =============================================================================
DO $$
DECLARE v_tx uuid; v_before int; v_after int;
BEGIN
  SELECT id INTO v_tx FROM public.finance_transactions WHERE booking_id = '60000000-0000-4000-8000-000000000032' AND transaction_type = 'provider_earnings' LIMIT 1;
  SELECT count(*) INTO v_before FROM public.journal_lines jl JOIN public.journal_entries je ON je.id = jl.entry_id WHERE je.source = 'finance_transactions' AND je.external_ref = v_tx::text;
  PERFORM public.recompute_journal_for_finance_tx(v_tx);
  SELECT count(*) INTO v_after FROM public.journal_lines jl JOIN public.journal_entries je ON je.id = jl.entry_id WHERE je.source = 'finance_transactions' AND je.external_ref = v_tx::text;
  PERFORM pg_temp.audit_assert(v_before = v_after, format('F2-40 recompute reproduces the trigger posting (%s lines before, %s after)', v_before, v_after));
END $$;

-- =============================================================================
-- F2-55  wallet_debit_self idempotency
-- =============================================================================
INSERT INTO public.user_wallets (user_id, currency, balance) VALUES ('20000000-0000-4000-8000-000000000003', 'ZAR', 100.00)
ON CONFLICT (user_id) DO UPDATE SET balance = 100.00;
SELECT pg_temp.audit_as('authenticated', '20000000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
DO $$
DECLARE r1 jsonb; r2 jsonb;
BEGIN
  r1 := public.wallet_debit_self(30.00, 'checkout', NULL, 'booking', '10000000-0000-4000-8000-000000000001', 'audit-debit-1');
  r2 := public.wallet_debit_self(30.00, 'checkout retry', NULL, 'booking', '10000000-0000-4000-8000-000000000001', 'audit-debit-1');
  PERFORM pg_temp.audit_assert((r1->>'balance')::numeric = 70.00, 'F2-55 first debit applied');
  PERFORM pg_temp.audit_assert((r2->>'idempotent')::boolean = true AND (r2->>'balance')::numeric = 70.00, 'F2-55 retried debit is a no-op');
END $$;
RESET ROLE;

-- =============================================================================
-- F2-43  gap-free document numbers
-- =============================================================================
DO $$
DECLARE a text; b text; c text;
BEGIN
  a := public.next_document_number('10000000-0000-4000-8000-000000000001', 'invoice');
  b := public.next_document_number('10000000-0000-4000-8000-000000000001', 'invoice');
  c := public.next_document_number('10000000-0000-4000-8000-000000000001', 'payout');
  PERFORM pg_temp.audit_assert(right(b, 6)::int = right(a, 6)::int + 1, format('F2-43 consecutive invoice numbers (%s, %s)', a, b));
  PERFORM pg_temp.audit_assert(c LIKE 'POUT-%-000001', format('F2-43 independent payout sequence (%s)', c));
END $$;

ROLLBACK;
\echo 30_controls_and_hygiene: ALL PASS
