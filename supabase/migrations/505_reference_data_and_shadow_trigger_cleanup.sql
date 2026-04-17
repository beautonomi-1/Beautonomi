-- 505_reference_data_and_shadow_trigger_cleanup.sql
--
-- Closes three P-class audit items from
-- docs/audits/BOOKING_SYSTEM_PRODUCTION_AUDIT_2026-04.md:
--
--   P3: reference_data (migration 080) seeds labels for booking statuses
--       that don't exist in the DB enum (`arrived`, `started`, `rescheduled`).
--       UI pickers and reports can show labels the DB can never store. Drop
--       the orphan rows and top up the real statuses the enum supports.
--
--   P5: public.check_booking_availability() (migration 012) short-circuits on
--       NOT IN ('cancelled','no_show') only — it ignores pending,
--       pending_payment, and booking_holds. Any path that still calls it
--       will happily double-book. The canonical gate is
--       lock_booking_services_for_update + check_booking_overlap (used by
--       validate-booking + reschedule RPC 503). Mark the old function
--       deprecated with a loud RAISE WARNING and a fail-closed return so
--       stray callers cannot cause incidents.
--
--   P6: shadow_post_finance_transaction (migration 495) only shadows
--       transaction_type IN ('payment','refund','tip','payout') into
--       journal_entries. Cancellation fees, provider earnings, platform
--       service fee, tax and travel fee movements were invisible to the
--       double-entry ledger. Widen the filter and add proper posting
--       branches so every completed finance_transactions row gets a
--       balanced journal entry.

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- P3 — reference_data cleanup
-- ───────────────────────────────────────────────────────────────────────────

DELETE FROM public.reference_data
 WHERE type = 'booking_status'
   AND value IN ('arrived', 'started', 'rescheduled');

INSERT INTO public.reference_data
  (type, value, label, description, display_order, metadata)
VALUES
  ('booking_status', 'in_progress',     'In Progress',     'Service currently in progress',                  3, '{"color": "#9C27B0"}'),
  ('booking_status', 'waiting',         'Waiting',         'Customer is waiting / pre-appointment queue',    4, '{"color": "#64B5F6"}'),
  ('booking_status', 'checked_in',      'Checked In',      'Customer has checked in for their appointment', 5, '{"color": "#1E88E5"}'),
  ('booking_status', 'pending_payment', 'Pending Payment', 'Booking awaiting payment confirmation',          2, '{"color": "#FB8C00"}')
ON CONFLICT (type, value) DO UPDATE
  SET label    = EXCLUDED.label,
      metadata = EXCLUDED.metadata;

-- ───────────────────────────────────────────────────────────────────────────
-- P5 — deprecate check_booking_availability
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_booking_availability(
  p_provider_id uuid,
  p_staff_id    uuid,
  p_starts_at   timestamptz,
  p_ends_at     timestamptz
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE WARNING
    '[deprecated] check_booking_availability is stale (ignores pending/pending_payment/booking_holds). '
    'Use lock_booking_services_for_update or the /api/public/booking-holds engine instead.';
  -- Fail closed so legacy callers cannot accidentally double-book.
  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.check_booking_availability(uuid, uuid, timestamptz, timestamptz) IS
  'DEPRECATED (P5, audit 2026-04). Fails closed. Call lock_booking_services_for_update.';

-- ───────────────────────────────────────────────────────────────────────────
-- P6 — Widen shadow trigger to cover every completed finance_transactions
-- transaction_type. The key invariant is balanced double-entry posting; each
-- branch below produces equal debit/credit reporting totals.
-- ───────────────────────────────────────────────────────────────────────────

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
  -- finance_transactions does not (yet) carry a currency column. All posting
  -- rows are reported in ZAR until a multi-currency migration adds one.
  v_currency       text    := 'ZAR';
BEGIN
  -- Extended transaction_type allowlist (P6, audit 2026-04).
  IF NEW.transaction_type NOT IN (
    'payment',
    'refund',
    'tip',
    'payout',
    'cancellation_fee',
    'provider_earnings',
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
    -- DR cash, CR platform revenue (fee), CR provider payable (net).
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,     'debit',  v_gross,                    v_currency, v_gross,                    'ZAR'),
      (v_entry_id, v_platform_acct, 'credit', v_platform_fee,             v_currency, v_platform_fee,             'ZAR'),
      (v_entry_id, v_payable_acct,  'credit', v_gross - v_platform_fee,   v_currency, v_gross - v_platform_fee,   'ZAR');

  ELSIF NEW.transaction_type = 'refund' THEN
    -- DR refunds expense, CR cash.
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_refund_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_cash_acct,   'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');

  ELSIF NEW.transaction_type = 'tip' THEN
    -- DR cash, CR tips payable.
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,  'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_tips_acct,  'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');

  ELSIF NEW.transaction_type = 'payout' THEN
    -- DR provider payable (settle), CR cash.
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_payable_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_cash_acct,    'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');

  ELSIF NEW.transaction_type = 'tax' THEN
    -- DR cash, CR tax payable (platform collects VAT on behalf).
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct, 'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_tax_acct,  'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');

  ELSIF NEW.transaction_type = 'service_fee' THEN
    -- Standalone platform service fee movement: DR cash, CR platform revenue.
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,     'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_platform_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');

  ELSIF NEW.transaction_type IN ('cancellation_fee', 'travel_fee', 'provider_earnings') THEN
    -- Provider-retained cash flows: DR cash, CR provider payable.
    -- `provider_earnings` rows from legacy writers may have been double-counted
    -- against the 'payment' branch; we still mirror them so the reconciliation
    -- view (v_ledger_reconciliation) can surface the discrepancy rather than
    -- dropping the row. Cleanup of those duplicates is tracked separately.
    INSERT INTO public.journal_lines (entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency)
    VALUES
      (v_entry_id, v_cash_acct,    'debit',  abs(v_gross), v_currency, abs(v_gross), 'ZAR'),
      (v_entry_id, v_payable_acct, 'credit', abs(v_gross), v_currency, abs(v_gross), 'ZAR');
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.shadow_post_finance_transaction() IS
  'P6 (audit 2026-04): shadow every completed finance_transactions row into '
  'journal_entries. Widened from 495 to include cancellation_fee, provider_earnings, '
  'service_fee, tax and travel_fee so the double-entry ledger is complete.';

COMMIT;
