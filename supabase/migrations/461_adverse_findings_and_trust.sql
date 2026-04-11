-- ============================================================================
-- Migration 461: Adverse findings tracking for user reports + trust signals
-- ============================================================================
-- Adds is_adverse_finding to user_reports so admins can distinguish between
-- "resolved" (we looked into it) and "resolved + adverse finding" (confirmed
-- bad behavior). 3+ adverse findings from different reporters flags a user.
-- ============================================================================

ALTER TABLE public.user_reports
  ADD COLUMN IF NOT EXISTS is_adverse_finding BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.user_reports
  ADD COLUMN IF NOT EXISTS admin_action_taken TEXT;  -- 'warning_issued', 'badge_downgraded', 'points_deducted', 'suspended', etc.

COMMENT ON COLUMN public.user_reports.is_adverse_finding
  IS 'True when the admin investigation substantiated the complaint against the reported user.';
COMMENT ON COLUMN public.user_reports.admin_action_taken
  IS 'Action taken by admin after adverse finding (warning_issued, badge_downgraded, points_deducted, suspended).';

CREATE INDEX IF NOT EXISTS idx_user_reports_adverse
  ON public.user_reports (reported_user_id, is_adverse_finding)
  WHERE is_adverse_finding = TRUE;

CREATE INDEX IF NOT EXISTS idx_user_reports_reported_user
  ON public.user_reports (reported_user_id, status);

-- Convenience view: adverse finding counts per reported user
CREATE OR REPLACE VIEW public.user_adverse_finding_summary AS
SELECT
  ur.reported_user_id,
  ur.tenant_id,
  COUNT(*) FILTER (WHERE ur.status != 'dismissed') AS total_reports,
  COUNT(*) FILTER (WHERE ur.is_adverse_finding = TRUE) AS adverse_finding_count,
  COUNT(DISTINCT ur.reporter_id) FILTER (WHERE ur.is_adverse_finding = TRUE) AS unique_adverse_reporters,
  MAX(ur.resolved_at) FILTER (WHERE ur.is_adverse_finding = TRUE) AS last_adverse_finding_at,
  BOOL_OR(
    (SELECT COUNT(DISTINCT r2.reporter_id) >= 3
     FROM public.user_reports r2
     WHERE r2.reported_user_id = ur.reported_user_id
       AND r2.is_adverse_finding = TRUE
       AND r2.tenant_id = ur.tenant_id)
  ) AS is_flagged
FROM public.user_reports ur
GROUP BY ur.reported_user_id, ur.tenant_id;

COMMENT ON VIEW public.user_adverse_finding_summary
  IS 'Aggregated adverse finding data per reported user. is_flagged=true when 3+ adverse findings from different reporters.';
