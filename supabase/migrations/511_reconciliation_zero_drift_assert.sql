-- 511_reconciliation_zero_drift_assert.sql
--
-- Launch-readiness 100/100 (Wave 1.1 cont.):
--   Adds a strict zero-drift assertion RPC plus a self-healing variant
--   used by the reconciliation-gate cron.
--
--   reconciliation_assert_zero_drift(p_from, p_to)
--     RAISES if any of the following are non-zero in the window:
--       - missing shadow rows (legacy without journal entry)
--       - imbalanced journal entries (debits != credits)
--       - debit/credit total drift
--     Returns a summary row when clean. Designed for CI pre-deploy gating
--     and for the daily reconciliation-gate cron.
--
--   reconciliation_self_heal(p_from, p_to)
--     For every legacy row missing a paired journal entry inside the
--     window, calls recompute_journal_for_finance_tx() to backfill.
--     Returns the number of rows healed. Safe to call before
--     reconciliation_assert_zero_drift() so transient missed rows do not
--     page on-call.

BEGIN;

CREATE OR REPLACE FUNCTION public.reconciliation_self_heal(
  p_from timestamptz DEFAULT (now() - interval '24 hours'),
  p_to   timestamptz DEFAULT now()
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id    uuid;
  v_count bigint := 0;
BEGIN
  FOR v_id IN
    SELECT ft.id
    FROM public.finance_transactions ft
    LEFT JOIN public.journal_entries je
      ON je.source = 'finance_transactions'
     AND je.external_ref = ft.id::text
    WHERE je.id IS NULL
      AND COALESCE(ft.created_at, '-infinity'::timestamptz) >= p_from
      AND COALESCE(ft.created_at, 'infinity'::timestamptz)   < p_to
  LOOP
    PERFORM public.recompute_journal_for_finance_tx(v_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconciliation_self_heal(timestamptz, timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.reconciliation_self_heal IS
  'Wave 1.1: backfill missing shadow journal entries inside a window. '
  'Use BEFORE reconciliation_assert_zero_drift() in cron to absorb '
  'transient race conditions.';

CREATE OR REPLACE FUNCTION public.reconciliation_assert_zero_drift(
  p_from      timestamptz DEFAULT (now() - interval '24 hours'),
  p_to        timestamptz DEFAULT now(),
  p_tolerance numeric     DEFAULT 0.0
)
RETURNS TABLE (
  legacy_row_count       bigint,
  shadowed_row_count     bigint,
  missing_row_count      bigint,
  imbalanced_entry_count bigint,
  legacy_sum_abs         numeric,
  ledger_sum_debits      numeric,
  ledger_sum_credits     numeric,
  debit_credit_drift     numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_summary record;
  v_drift   numeric;
BEGIN
  SELECT
    s.legacy_row_count,
    s.shadowed_row_count,
    s.missing_row_count,
    s.imbalanced_entry_count,
    s.legacy_sum_abs,
    s.ledger_sum_debits,
    s.ledger_sum_credits
  INTO v_summary
  FROM public.ledger_reconciliation_summary(p_from, p_to) s;

  v_drift := abs(COALESCE(v_summary.ledger_sum_debits, 0) - COALESCE(v_summary.ledger_sum_credits, 0));

  IF COALESCE(v_summary.missing_row_count, 0) > 0
    OR COALESCE(v_summary.imbalanced_entry_count, 0) > 0
    OR v_drift > COALESCE(p_tolerance, 0)
  THEN
    RAISE EXCEPTION
      'reconciliation drift detected window=[%, %] missing=% imbalanced=% drift=%',
      p_from, p_to,
      v_summary.missing_row_count,
      v_summary.imbalanced_entry_count,
      v_drift
      USING ERRCODE = '40000';
  END IF;

  RETURN QUERY
  SELECT
    v_summary.legacy_row_count,
    v_summary.shadowed_row_count,
    v_summary.missing_row_count,
    v_summary.imbalanced_entry_count,
    v_summary.legacy_sum_abs,
    v_summary.ledger_sum_debits,
    v_summary.ledger_sum_credits,
    v_drift;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconciliation_assert_zero_drift(timestamptz, timestamptz, numeric)
  TO service_role;

COMMENT ON FUNCTION public.reconciliation_assert_zero_drift IS
  'Wave 1.1: STRICT zero-drift assertion. RAISES with errcode 40000 if '
  'missing/imbalanced/debit-credit drift exceed tolerance (default 0). '
  'Used by reconciliation-gate cron AFTER reconciliation_self_heal and '
  'by CI to block deploys that would land with drift.';

COMMIT;
