-- Retention quota: when a rep saves an at-risk provider (booking trend intervention)

ALTER TABLE public.provider_ops_cases
  ADD COLUMN IF NOT EXISTS at_risk_flagged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS at_risk_saved_at TIMESTAMPTZ;

COMMENT ON COLUMN public.provider_ops_cases.at_risk_flagged_at IS
  'When the case was flagged for booking-trend decline (optional; trend also computed live).';
COMMENT ON COLUMN public.provider_ops_cases.at_risk_saved_at IS
  'When retention recorded a successful save for an at-risk provider (quota metric at_risk_saves).';

CREATE INDEX IF NOT EXISTS idx_provider_ops_cases_at_risk_saved
  ON public.provider_ops_cases (tenant_id, retention_owner_id, at_risk_saved_at)
  WHERE at_risk_saved_at IS NOT NULL;
