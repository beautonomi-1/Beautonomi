-- Immutable audit trail for regulatory / compliance account purges (superadmin actions).
-- Populated by apps/web after a successful purge; retained for audit even if actors are deactivated.

CREATE TABLE IF NOT EXISTS public.compliance_purge_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  purge_type TEXT NOT NULL CHECK (purge_type IN ('user', 'provider_org')),
  target_user_id UUID,
  provider_id UUID,
  reason TEXT NOT NULL,
  report JSONB NOT NULL DEFAULT '{}'::jsonb,
  purged_user_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  CONSTRAINT compliance_purge_reason_min_len CHECK (char_length(trim(reason)) >= 20)
);

CREATE INDEX IF NOT EXISTS idx_compliance_purge_audit_created ON public.compliance_purge_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_purge_audit_actor ON public.compliance_purge_audit_log (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_compliance_purge_audit_tenant ON public.compliance_purge_audit_log (tenant_id);
CREATE INDEX IF NOT EXISTS idx_compliance_purge_audit_type ON public.compliance_purge_audit_log (purge_type);

COMMENT ON TABLE public.compliance_purge_audit_log IS
  'Compliance purges: reason, full confirmation report JSON, and all auth user ids removed. Superadmin-only via API.';

ALTER TABLE public.compliance_purge_audit_log ENABLE ROW LEVEL SECURITY;

-- Superadmins can read; inserts only via service role (Next.js API with admin client)
CREATE POLICY "Superadmins can read compliance purge audit"
  ON public.compliance_purge_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
  );

CREATE POLICY "Service role full access compliance purge audit"
  ON public.compliance_purge_audit_log FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
