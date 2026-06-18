-- Retention expiry for compliance purge audit snapshots (POPIA/GDPR data minimization).
-- Rows with purge_after_at in the past are removed by /api/cron/purge-compliance-snapshots.

ALTER TABLE public.compliance_purge_audit_log
  ADD COLUMN IF NOT EXISTS purge_after_at TIMESTAMPTZ;

COMMENT ON COLUMN public.compliance_purge_audit_log.purge_after_at IS
  'When this audit row may be deleted by retention cron. NULL = never auto-purge (legacy).';

-- Backfill: retain existing rows for 5 years from creation.
UPDATE public.compliance_purge_audit_log
SET purge_after_at = created_at + INTERVAL '5 years'
WHERE purge_after_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_compliance_purge_audit_purge_after
  ON public.compliance_purge_audit_log (purge_after_at)
  WHERE purge_after_at IS NOT NULL;
