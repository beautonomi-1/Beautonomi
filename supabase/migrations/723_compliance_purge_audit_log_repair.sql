-- ============================================================================
-- 723: compliance_purge_audit_log — idempotent repair
-- ============================================================================
-- Fixes two schema-drift issues that caused the audit-write to fail silently
-- after a successful tenant reset:
--
--   1) purge_after_at column missing from the live DB (added by 694 but the
--      PostgREST schema cache was never notified → Supabase JS returns
--      "Could not find the 'purge_after_at' column … in the schema cache").
--
--   2) purge_type CHECK constraint was originally only ('user','provider_org');
--      'tenant_reset' was widened in 508 but environments that skipped 508
--      would reject the insert with a CHECK violation.
--
-- Idempotent: every statement uses IF NOT EXISTS / DO-block guards so this is
-- safe to re-run on any environment (local, staging, prod).
--
-- NOTIFY at the end forces PostgREST to reload its schema cache immediately —
-- the missing NOTIFY was the proximate cause of the "schema cache" error.

-- 1. Add the column (no-op if already present).
ALTER TABLE public.compliance_purge_audit_log
  ADD COLUMN IF NOT EXISTS purge_after_at TIMESTAMPTZ;

COMMENT ON COLUMN public.compliance_purge_audit_log.purge_after_at IS
  'When this audit row may be deleted by retention cron. NULL = never auto-purge (legacy).';

-- 2. Widen the purge_type CHECK to include tenant_reset.
--    Drop the old constraint by name first (both possible names from 441 and 508),
--    then add the canonical three-value constraint — safe if already widened.
DO $$
BEGIN
  -- Drop the original narrow constraint (441) if it still exists.
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'compliance_purge_audit_log'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%purge_type%'
      AND pg_get_constraintdef(c.oid) NOT LIKE '%tenant_reset%'
  ) THEN
    -- The constraint may have any name; drop whichever one is narrow.
    EXECUTE (
      SELECT format('ALTER TABLE public.compliance_purge_audit_log DROP CONSTRAINT %I', c.conname)
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'compliance_purge_audit_log'
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) LIKE '%purge_type%'
        AND pg_get_constraintdef(c.oid) NOT LIKE '%tenant_reset%'
      LIMIT 1
    );
  END IF;
END;
$$;

-- Add the canonical three-value CHECK (idempotent name).
ALTER TABLE public.compliance_purge_audit_log
  DROP CONSTRAINT IF EXISTS compliance_purge_audit_purge_type_check;

ALTER TABLE public.compliance_purge_audit_log
  ADD CONSTRAINT compliance_purge_audit_purge_type_check
  CHECK (purge_type IN ('user', 'provider_org', 'tenant_reset'));

-- 3. Backfill existing rows that were written before purge_after_at existed.
UPDATE public.compliance_purge_audit_log
SET purge_after_at = created_at + INTERVAL '5 years'
WHERE purge_after_at IS NULL;

-- 4. Recreate the retention index (no-op if already present from 694).
CREATE INDEX IF NOT EXISTS idx_compliance_purge_audit_purge_after
  ON public.compliance_purge_audit_log (purge_after_at)
  WHERE purge_after_at IS NOT NULL;

-- 5. Reload PostgREST schema cache so the new column is visible immediately.
--    This is what was missing from migration 694 and caused the cache error.
NOTIFY pgrst, 'reload schema';
