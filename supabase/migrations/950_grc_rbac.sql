-- GRC RBAC: assignments, permission matrix, activity log hash chain, hub feature flag.
-- Requires 949_grc_admin_role_enum.sql applied first.

-- ─── Assignments ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.grc_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  grc_role TEXT NOT NULL,
  reason TEXT NOT NULL,
  assigned_by UUID REFERENCES public.users(id),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT grc_role_assignments_role_check CHECK (
    grc_role IN (
      'grc_admin', 'security_lead', 'risk_manager', 'privacy_officer',
      'it_operations', 'architecture', 'management_approver', 'contributor', 'viewer'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS grc_role_assignments_active_unique
  ON public.grc_role_assignments (user_id, grc_role)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS grc_role_assignments_user_idx ON public.grc_role_assignments (user_id);

-- ─── Permission seed table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.grc_role_permissions (
  grc_role TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  PRIMARY KEY (grc_role, permission_key)
);

-- ─── Append-only activity log (hash chain) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.grc_activity_log (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id UUID REFERENCES public.users(id),
  actor_label TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  prev_hash TEXT,
  row_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS grc_activity_log_created_idx ON public.grc_activity_log (created_at DESC);

-- ─── Helpers ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.grc_is_admin_user(p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_uid
      AND u.role::text IN (
        'superadmin', 'support_agent', 'admin_support', 'admin_finance', 'admin_trust',
        'admin_content', 'admin_ecommerce', 'admin_marketing', 'admin_integrations',
        'admin_operations', 'admin_platform_config', 'admin_sales', 'admin_onboarding',
        'admin_retention', 'admin_grc'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.grc_has_active_assignment(p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.grc_role_assignments a
    WHERE a.user_id = p_uid
      AND a.is_active = true
      AND (a.expires_at IS NULL OR a.expires_at > NOW())
  );
$$;

CREATE OR REPLACE FUNCTION public.grc_has_permission(p_uid UUID, p_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_super BOOLEAN;
BEGIN
  IF p_uid IS NULL OR p_key IS NULL THEN
    RETURN false;
  END IF;

  SELECT (u.role = 'superadmin') INTO v_super FROM public.users u WHERE u.id = p_uid;
  IF v_super THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.grc_role_assignments a
    JOIN public.grc_role_permissions p ON p.grc_role = a.grc_role
    WHERE a.user_id = p_uid
      AND a.is_active = true
      AND (a.expires_at IS NULL OR a.expires_at > NOW())
      AND p.permission_key = p_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grc_has_permission(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grc_has_permission(UUID, TEXT) TO authenticated, service_role;

-- ─── Assignment guard: admin users only, no self-grant ───────────────────────
CREATE OR REPLACE FUNCTION public.grc_role_assignments_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NOT public.grc_is_admin_user(NEW.assigned_by) AND NEW.assigned_by IS NOT NULL THEN
      RAISE EXCEPTION 'grc assignment must be created by an admin user';
    END IF;
    IF NEW.assigned_by IS NOT NULL AND NEW.assigned_by = NEW.user_id THEN
      RAISE EXCEPTION 'grc self-grant is not allowed';
    END IF;
    IF NOT public.grc_is_admin_user(NEW.user_id) THEN
      RAISE EXCEPTION 'grc assignments require admin shell access on target user';
    END IF;
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grc_role_assignments_guard_trg ON public.grc_role_assignments;
CREATE TRIGGER grc_role_assignments_guard_trg
  BEFORE INSERT OR UPDATE ON public.grc_role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.grc_role_assignments_guard();

-- ─── Activity log hash chain + append-only ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.grc_activity_log_chain()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prev TEXT;
  v_payload TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('grc_activity_log_chain'));
  SELECT row_hash INTO v_prev
  FROM public.grc_activity_log
  ORDER BY id DESC
  LIMIT 1;
  NEW.prev_hash := v_prev;
  v_payload := concat_ws('|', NEW.action, COALESCE(NEW.entity_type, ''), COALESCE(NEW.entity_id, ''), NEW.created_at::text, COALESCE(NEW.prev_hash, ''));
  NEW.row_hash := encode(digest(v_payload, 'sha256'), 'hex');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grc_activity_log_chain_trg ON public.grc_activity_log;
CREATE TRIGGER grc_activity_log_chain_trg
  BEFORE INSERT ON public.grc_activity_log
  FOR EACH ROW EXECUTE FUNCTION public.grc_activity_log_chain();

CREATE OR REPLACE FUNCTION public.grc_activity_log_deny_mutate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'grc_activity_log is append-only';
END;
$$;

DROP TRIGGER IF EXISTS grc_activity_log_no_update ON public.grc_activity_log;
CREATE TRIGGER grc_activity_log_no_update
  BEFORE UPDATE OR DELETE ON public.grc_activity_log
  FOR EACH ROW EXECUTE FUNCTION public.grc_activity_log_deny_mutate();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.grc_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grc_role_assignments_select ON public.grc_role_assignments;
CREATE POLICY grc_role_assignments_select ON public.grc_role_assignments
  FOR SELECT TO authenticated
  USING (
    public.grc_has_permission(auth.uid(), 'grc.assignments.manage')
    OR user_id = auth.uid()
    OR public.grc_has_active_assignment(auth.uid())
  );

DROP POLICY IF EXISTS grc_role_assignments_write ON public.grc_role_assignments;
CREATE POLICY grc_role_assignments_write ON public.grc_role_assignments
  FOR ALL TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.assignments.manage'))
  WITH CHECK (public.grc_has_permission(auth.uid(), 'grc.assignments.manage'));

DROP POLICY IF EXISTS grc_role_permissions_read ON public.grc_role_permissions;
CREATE POLICY grc_role_permissions_read ON public.grc_role_permissions
  FOR SELECT TO authenticated
  USING (public.grc_has_active_assignment(auth.uid()) OR public.grc_has_permission(auth.uid(), 'grc.settings.manage'));

DROP POLICY IF EXISTS grc_activity_log_select ON public.grc_activity_log;
CREATE POLICY grc_activity_log_select ON public.grc_activity_log
  FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.overview.view'));

DROP POLICY IF EXISTS grc_activity_log_insert ON public.grc_activity_log;
CREATE POLICY grc_activity_log_insert ON public.grc_activity_log
  FOR INSERT TO authenticated
  WITH CHECK (public.grc_has_active_assignment(auth.uid()) OR auth.role() = 'service_role');

-- ─── Feature flag (off by default) ───────────────────────────────────────────
INSERT INTO public.feature_flags (
  feature_key, feature_name, description, enabled, category, metadata
)
VALUES (
  'grc_hub_enabled',
  'Security & Compliance hub',
  'Internal GRC trust centre in admin SPA and /api/admin/grc APIs.',
  false,
  'control_plane',
  '{"environments":["production","staging"]}'::jsonb
)
ON CONFLICT (feature_key) WHERE tenant_id IS NULL DO NOTHING;

-- ─── Permission matrix seed (generated body follows) ─────────────────────────


-- AUTO-GENERATED — node scripts/generate-grc-rbac-seed.mjs
INSERT INTO public.grc_role_permissions (grc_role, permission_key)
VALUES
  ('grc_admin', 'grc.overview.view'),
  ('grc_admin', 'grc.controls.view'),
  ('grc_admin', 'grc.controls.edit'),
  ('grc_admin', 'grc.documents.view'),
  ('grc_admin', 'grc.documents.edit'),
  ('grc_admin', 'grc.documents.approve'),
  ('grc_admin', 'grc.risks.view'),
  ('grc_admin', 'grc.risks.edit'),
  ('grc_admin', 'grc.risks.accept'),
  ('grc_admin', 'grc.assets.view'),
  ('grc_admin', 'grc.assets.edit'),
  ('grc_admin', 'grc.vendors.view'),
  ('grc_admin', 'grc.vendors.edit'),
  ('grc_admin', 'grc.privacy.view'),
  ('grc_admin', 'grc.privacy.edit'),
  ('grc_admin', 'grc.evidence.view'),
  ('grc_admin', 'grc.evidence.submit'),
  ('grc_admin', 'grc.evidence.review'),
  ('grc_admin', 'grc.access_reviews.view'),
  ('grc_admin', 'grc.access_reviews.decide'),
  ('grc_admin', 'grc.findings.view'),
  ('grc_admin', 'grc.findings.edit'),
  ('grc_admin', 'grc.findings.close'),
  ('grc_admin', 'grc.incidents.view'),
  ('grc_admin', 'grc.incidents.edit'),
  ('grc_admin', 'grc.audits.view'),
  ('grc_admin', 'grc.audits.edit'),
  ('grc_admin', 'grc.audit_packs.generate'),
  ('grc_admin', 'grc.settings.manage'),
  ('grc_admin', 'grc.assignments.manage'),
  ('security_lead', 'grc.overview.view'),
  ('security_lead', 'grc.controls.view'),
  ('security_lead', 'grc.controls.edit'),
  ('security_lead', 'grc.documents.view'),
  ('security_lead', 'grc.documents.edit'),
  ('security_lead', 'grc.documents.approve'),
  ('security_lead', 'grc.evidence.view'),
  ('security_lead', 'grc.evidence.review'),
  ('security_lead', 'grc.findings.view'),
  ('security_lead', 'grc.findings.edit'),
  ('security_lead', 'grc.findings.close'),
  ('security_lead', 'grc.incidents.view'),
  ('security_lead', 'grc.incidents.edit'),
  ('security_lead', 'grc.access_reviews.view'),
  ('security_lead', 'grc.audits.view'),
  ('risk_manager', 'grc.overview.view'),
  ('risk_manager', 'grc.controls.view'),
  ('risk_manager', 'grc.risks.view'),
  ('risk_manager', 'grc.risks.edit'),
  ('risk_manager', 'grc.risks.accept'),
  ('risk_manager', 'grc.vendors.view'),
  ('risk_manager', 'grc.vendors.edit'),
  ('risk_manager', 'grc.assets.view'),
  ('risk_manager', 'grc.audits.view'),
  ('risk_manager', 'grc.audits.edit'),
  ('privacy_officer', 'grc.overview.view'),
  ('privacy_officer', 'grc.privacy.view'),
  ('privacy_officer', 'grc.privacy.edit'),
  ('privacy_officer', 'grc.assets.view'),
  ('privacy_officer', 'grc.vendors.view'),
  ('privacy_officer', 'grc.incidents.view'),
  ('privacy_officer', 'grc.incidents.edit'),
  ('privacy_officer', 'grc.documents.view'),
  ('it_operations', 'grc.overview.view'),
  ('it_operations', 'grc.assets.view'),
  ('it_operations', 'grc.assets.edit'),
  ('it_operations', 'grc.access_reviews.view'),
  ('it_operations', 'grc.access_reviews.decide'),
  ('it_operations', 'grc.incidents.view'),
  ('it_operations', 'grc.incidents.edit'),
  ('it_operations', 'grc.evidence.view'),
  ('it_operations', 'grc.evidence.submit'),
  ('it_operations', 'grc.controls.view'),
  ('architecture', 'grc.overview.view'),
  ('architecture', 'grc.assets.view'),
  ('architecture', 'grc.assets.edit'),
  ('architecture', 'grc.controls.view'),
  ('architecture', 'grc.evidence.view'),
  ('architecture', 'grc.evidence.submit'),
  ('architecture', 'grc.documents.view'),
  ('management_approver', 'grc.overview.view'),
  ('management_approver', 'grc.controls.view'),
  ('management_approver', 'grc.documents.view'),
  ('management_approver', 'grc.risks.view'),
  ('management_approver', 'grc.assets.view'),
  ('management_approver', 'grc.vendors.view'),
  ('management_approver', 'grc.privacy.view'),
  ('management_approver', 'grc.evidence.view'),
  ('management_approver', 'grc.access_reviews.view'),
  ('management_approver', 'grc.findings.view'),
  ('management_approver', 'grc.incidents.view'),
  ('management_approver', 'grc.audits.view'),
  ('management_approver', 'grc.documents.approve'),
  ('management_approver', 'grc.risks.accept'),
  ('management_approver', 'grc.audits.edit'),
  ('contributor', 'grc.overview.view'),
  ('contributor', 'grc.controls.view'),
  ('contributor', 'grc.evidence.view'),
  ('contributor', 'grc.evidence.submit'),
  ('contributor', 'grc.documents.view'),
  ('viewer', 'grc.overview.view'),
  ('viewer', 'grc.controls.view'),
  ('viewer', 'grc.documents.view'),
  ('viewer', 'grc.risks.view'),
  ('viewer', 'grc.assets.view'),
  ('viewer', 'grc.vendors.view'),
  ('viewer', 'grc.privacy.view'),
  ('viewer', 'grc.evidence.view'),
  ('viewer', 'grc.access_reviews.view'),
  ('viewer', 'grc.findings.view'),
  ('viewer', 'grc.incidents.view'),
  ('viewer', 'grc.audits.view')
ON CONFLICT (grc_role, permission_key) DO NOTHING;

