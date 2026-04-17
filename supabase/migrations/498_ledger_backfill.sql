-- F14 Phase 2 — Backfill historical finance_transactions into journal_entries / journal_lines.
--
-- The shadow trigger introduced in migration 495 only fires on INSERT, so every
-- finance_transactions row that pre-dates it is invisible to the double-entry
-- ledger. This migration replays those historical rows, synthesising balanced
-- journal entries with source='finance_transactions' and external_ref=ft.id::text
-- (same keys the trigger uses, so the shadow trigger and this backfill share a
-- reconciliation identity).
--
-- Idempotency
-- -----------
-- The backfill is keyed on (source, external_ref). It inserts only when no
-- matching journal_entry exists, so it is safe to re-run.
--
-- Balance enforcement
-- -------------------
-- The constraint trigger on journal_lines is DEFERRABLE INITIALLY DEFERRED, so
-- the per-entry balance check runs at COMMIT. The function wraps everything
-- in a single implicit transaction via the PL/pgSQL block.

-- Safety net: guarantee each (source, external_ref) maps to at most one
-- journal entry — protects against concurrent trigger + backfill races.
CREATE UNIQUE INDEX IF NOT EXISTS ux_journal_entries_source_ref
  ON public.journal_entries (source, external_ref)
  WHERE external_ref IS NOT NULL;

CREATE OR REPLACE FUNCTION public.backfill_journal_entries_from_finance_transactions(
  p_batch_size  integer DEFAULT 5000,
  p_max_batches integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cash_acct     uuid;
  v_payable_acct  uuid;
  v_platform_acct uuid;
  v_refund_acct   uuid;
  v_inserted_rows bigint := 0;
  v_batch_rows    bigint;
  v_batches       integer := 0;
  v_started       timestamptz := clock_timestamp();
BEGIN
  SELECT id INTO v_cash_acct     FROM public.gl_accounts WHERE code = '1000';
  SELECT id INTO v_payable_acct  FROM public.gl_accounts WHERE code = '2000';
  SELECT id INTO v_platform_acct FROM public.gl_accounts WHERE code = '3000';
  SELECT id INTO v_refund_acct   FROM public.gl_accounts WHERE code = '4100';

  IF v_cash_acct IS NULL OR v_payable_acct IS NULL
     OR v_platform_acct IS NULL OR v_refund_acct IS NULL THEN
    RAISE EXCEPTION 'Chart of accounts seed rows missing — run migration 495 first.';
  END IF;

  LOOP
    v_batches := v_batches + 1;
    IF v_batches > p_max_batches THEN
      EXIT;
    END IF;

    -- 1) Synthesise journal_entries for the next batch of un-shadowed finance rows.
    WITH todo AS (
      SELECT ft.*
      FROM public.finance_transactions ft
      LEFT JOIN public.journal_entries je
        ON je.source = 'finance_transactions' AND je.external_ref = ft.id::text
      WHERE je.id IS NULL
        AND ft.transaction_type IN ('payment', 'refund', 'tip', 'payout')
      ORDER BY ft.created_at NULLS FIRST, ft.id
      LIMIT p_batch_size
    ),
    ins_entries AS (
      INSERT INTO public.journal_entries (
        provider_id, booking_id, payment_id, refund_id,
        source, external_ref, description, posted_at,
        reporting_currency, created_by
      )
      SELECT
        t.provider_id,
        t.booking_id,
        t.source_payment_id,
        t.source_refund_id,
        'finance_transactions',
        t.id::text,
        t.transaction_type,
        COALESCE(t.created_at, now()),
        'ZAR',
        'backfill-498'
      FROM todo t
      ON CONFLICT (source, external_ref) WHERE external_ref IS NOT NULL DO NOTHING
      RETURNING id, external_ref
    ),
    -- 2) Join back to derive the amount/type for line generation.
    entry_join AS (
      SELECT
        ie.id           AS entry_id,
        ft.id           AS ft_id,
        ft.transaction_type,
        COALESCE(ft.amount, 0) AS gross,
        COALESCE(ft.net,    0) AS platform_fee
      FROM ins_entries ie
      JOIN public.finance_transactions ft
        ON ft.id = ie.external_ref::uuid
    ),
    -- 3) Insert balanced lines per entry.
    ins_payment_lines AS (
      INSERT INTO public.journal_lines (
        entry_id, account_id, side, raw_amount, raw_currency,
        reporting_amount, reporting_currency
      )
      SELECT entry_id, v_cash_acct,    'debit',  ej.gross,                       'ZAR', ej.gross,                       'ZAR'
        FROM entry_join ej WHERE ej.transaction_type = 'payment'
      UNION ALL
      SELECT entry_id, v_platform_acct,'credit', ej.platform_fee,                 'ZAR', ej.platform_fee,                 'ZAR'
        FROM entry_join ej WHERE ej.transaction_type = 'payment'
      UNION ALL
      SELECT entry_id, v_payable_acct, 'credit', ej.gross - ej.platform_fee,       'ZAR', ej.gross - ej.platform_fee,       'ZAR'
        FROM entry_join ej WHERE ej.transaction_type = 'payment'
      RETURNING 1
    ),
    ins_refund_lines AS (
      INSERT INTO public.journal_lines (
        entry_id, account_id, side, raw_amount, raw_currency,
        reporting_amount, reporting_currency
      )
      SELECT entry_id, v_refund_acct, 'debit',  abs(ej.gross), 'ZAR', abs(ej.gross), 'ZAR'
        FROM entry_join ej WHERE ej.transaction_type = 'refund'
      UNION ALL
      SELECT entry_id, v_cash_acct,   'credit', abs(ej.gross), 'ZAR', abs(ej.gross), 'ZAR'
        FROM entry_join ej WHERE ej.transaction_type = 'refund'
      RETURNING 1
    ),
    ins_passthrough_lines AS (
      INSERT INTO public.journal_lines (
        entry_id, account_id, side, raw_amount, raw_currency,
        reporting_amount, reporting_currency
      )
      SELECT entry_id, v_cash_acct,    'debit',  abs(ej.gross), 'ZAR', abs(ej.gross), 'ZAR'
        FROM entry_join ej WHERE ej.transaction_type IN ('tip','payout')
      UNION ALL
      SELECT entry_id, v_payable_acct, 'credit', abs(ej.gross), 'ZAR', abs(ej.gross), 'ZAR'
        FROM entry_join ej WHERE ej.transaction_type IN ('tip','payout')
      RETURNING 1
    )
    SELECT count(*) INTO v_batch_rows FROM entry_join;

    v_inserted_rows := v_inserted_rows + COALESCE(v_batch_rows, 0);

    EXIT WHEN COALESCE(v_batch_rows, 0) = 0;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',            true,
    'inserted_rows', v_inserted_rows,
    'batches',       v_batches - 1,
    'duration_ms',   (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::bigint
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok',            false,
    'error',         SQLERRM,
    'inserted_rows', v_inserted_rows
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_journal_entries_from_finance_transactions(integer, integer)
  TO service_role;

COMMENT ON FUNCTION public.backfill_journal_entries_from_finance_transactions IS
  'F14 Phase 2: replays historical finance_transactions into journal_entries / journal_lines. Idempotent — skips rows already shadow-posted. Call with custom batch_size / max_batches in ops scripts, or run with defaults after deploy.';

-- Immediately execute a bounded backfill pass so a single migration run catches
-- up with steady-state inserts. Production datasets that exceed the default
-- (5000 × 200 = 1M rows) should re-invoke the function afterwards until
-- `inserted_rows` returns 0.
DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.backfill_journal_entries_from_finance_transactions(5000, 200);
  RAISE NOTICE 'ledger backfill: %', v_result;
  IF (v_result ->> 'ok')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ledger backfill failed: %', v_result;
  END IF;
END $$;
