-- 500_refund_double_write_cleanup.sql
-- Remediates Blocker B1 from the 2026-04 production audit: app-side refund
-- code paths were inserting a second finance_transactions row for every
-- completed booking_refunds row, in addition to the row written by the
-- AFTER INSERT/UPDATE trigger `create_finance_ledger_from_booking_refund`
-- (migration 490). Because the partial unique index
-- `ux_finance_transactions_source_refund` only applies when
-- `source_refund_id IS NOT NULL`, the manual app inserts (which left the
-- column NULL) never conflicted. All refund-driven financial reporting was
-- double-counted.
--
-- This migration removes the historical duplicates in two passes:
--   1. Pair each trigger-written row (source_refund_id IS NOT NULL) with the
--      matching app-written row (same booking_id, same -amount, created
--      within ±60 seconds) and delete the app-written row.
--   2. Backstop: if multiple NULL rows still exist for the same refund,
--      keep only the earliest and delete the rest.
--
-- The cleanup is audited into `public.audit_logs` (best-effort) so finance
-- can diff the rows that were removed against the surviving ledger.

BEGIN;

-- Guard: only run if the partial unique index exists (confirms schema baseline).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname  = 'ux_finance_transactions_source_refund'
  ) THEN
    RAISE EXCEPTION
      '500_refund_double_write_cleanup requires ux_finance_transactions_source_refund (migration 490). Aborting.';
  END IF;
END $$;

-- Stage duplicates into a temp table for auditing.
CREATE TEMP TABLE _refund_double_writes ON COMMIT DROP AS
WITH trigger_rows AS (
  SELECT
    ft.id        AS keeper_id,
    ft.booking_id,
    ft.amount,
    ft.net,
    ft.created_at,
    ft.source_refund_id
  FROM public.finance_transactions ft
  WHERE ft.transaction_type = 'refund'
    AND ft.source_refund_id IS NOT NULL
),
candidate_duplicates AS (
  SELECT
    dup.id          AS duplicate_id,
    dup.booking_id,
    dup.amount,
    dup.net,
    dup.created_at  AS dup_created_at,
    tr.keeper_id,
    tr.source_refund_id,
    ROW_NUMBER() OVER (
      PARTITION BY dup.id
      ORDER BY ABS(EXTRACT(EPOCH FROM (dup.created_at - tr.created_at)))
    ) AS rn
  FROM public.finance_transactions dup
  JOIN trigger_rows tr
    ON tr.booking_id = dup.booking_id
   AND tr.amount     = dup.amount
   AND tr.net        = dup.net
   AND ABS(EXTRACT(EPOCH FROM (dup.created_at - tr.created_at))) <= 60
  WHERE dup.transaction_type   = 'refund'
    AND dup.source_refund_id   IS NULL
    AND dup.id                <> tr.keeper_id
)
SELECT
  duplicate_id,
  keeper_id,
  source_refund_id,
  booking_id,
  amount,
  net,
  dup_created_at
FROM candidate_duplicates
WHERE rn = 1;

-- Audit the removals (best-effort — skip if audit_logs does not exist yet).
DO $$
DECLARE
  v_count bigint;
BEGIN
  SELECT COUNT(*) INTO v_count FROM _refund_double_writes;
  IF v_count = 0 THEN
    RAISE NOTICE 'refund double-write cleanup: no duplicates detected.';
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata, created_at)
    SELECT
      NULL,
      'refund_ledger_duplicate_purge',
      'finance_transactions',
      dup.duplicate_id,
      jsonb_build_object(
        'keeper_id',        dup.keeper_id,
        'source_refund_id', dup.source_refund_id,
        'booking_id',       dup.booking_id,
        'amount',           dup.amount,
        'net',              dup.net,
        'duplicate_created_at', dup.dup_created_at,
        'reason',           'B1 cleanup (migration 500) — remove app-side duplicate of trigger 490 write'
      ),
      now()
    FROM _refund_double_writes dup;
  EXCEPTION
    WHEN undefined_table THEN
      RAISE NOTICE 'audit_logs table missing — skipping audit trail for refund cleanup';
    WHEN undefined_column THEN
      RAISE NOTICE 'audit_logs schema drift — skipping audit trail for refund cleanup';
  END;

  RAISE NOTICE 'refund double-write cleanup: purging % duplicates', v_count;
END $$;

-- Primary cleanup: delete the NULL-source app-side duplicates.
DELETE FROM public.finance_transactions ft
USING _refund_double_writes dup
WHERE ft.id = dup.duplicate_id;

-- Backstop pass: if a booking still has multiple refund rows with NULL
-- source_refund_id (e.g. ancient manual entries that had no trigger pair),
-- keep the earliest and purge the rest so reporting aggregates are consistent.
WITH ranked_null_refunds AS (
  SELECT
    ft.id,
    ROW_NUMBER() OVER (
      PARTITION BY ft.booking_id, ft.amount, ft.net
      ORDER BY ft.created_at ASC, ft.id ASC
    ) AS rn
  FROM public.finance_transactions ft
  WHERE ft.transaction_type = 'refund'
    AND ft.source_refund_id IS NULL
    AND ft.booking_id IS NOT NULL
)
DELETE FROM public.finance_transactions ft
USING ranked_null_refunds r
WHERE ft.id = r.id
  AND r.rn > 1;

COMMIT;
