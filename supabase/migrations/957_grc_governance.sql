-- GRC governance: audits, management review, audit packs

CREATE TABLE IF NOT EXISTS public.grc_internal_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  scope TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  conducted_at DATE,
  lead_user_id UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.grc_corrective_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID REFERENCES public.grc_findings(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  owner_user_id UUID REFERENCES public.users(id),
  due_at DATE,
  completed_at DATE
);

CREATE TABLE IF NOT EXISTS public.grc_management_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_date DATE NOT NULL,
  minutes_markdown TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  approved_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.grc_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  target_metric TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  due_date DATE
);

CREATE TABLE IF NOT EXISTS public.grc_audit_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  redact_pii BOOLEAN NOT NULL DEFAULT true,
  manifest_hash TEXT,
  storage_path TEXT,
  part_count INT NOT NULL DEFAULT 1,
  error_message TEXT,
  requested_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ready_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.grc_audit_pack_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_pack_id UUID NOT NULL REFERENCES public.grc_audit_packs(id) ON DELETE CASCADE,
  downloaded_by UUID REFERENCES public.users(id),
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.grc_internal_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_corrective_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_management_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_audit_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_audit_pack_downloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY grc_audits_select ON public.grc_internal_audits FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.audits.view'));
CREATE POLICY grc_audits_write ON public.grc_internal_audits FOR ALL TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.audits.edit'))
  WITH CHECK (public.grc_has_permission(auth.uid(), 'grc.audits.edit'));
CREATE POLICY grc_corrective_select ON public.grc_corrective_actions FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.findings.view'));
CREATE POLICY grc_mgmt_review_select ON public.grc_management_reviews FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.audits.view'));
CREATE POLICY grc_objectives_select ON public.grc_objectives FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.audits.view'));
CREATE POLICY grc_audit_packs_select ON public.grc_audit_packs FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.audit_packs.generate'));
CREATE POLICY grc_audit_packs_insert ON public.grc_audit_packs FOR INSERT TO authenticated
  WITH CHECK (public.grc_has_permission(auth.uid(), 'grc.audit_packs.generate'));
CREATE POLICY grc_audit_pack_dl_select ON public.grc_audit_pack_downloads FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.audit_packs.generate'));

-- CSP unsafe-inline/eval compensating exception (plan remediation)
INSERT INTO public.grc_exceptions (title, description, compensating_controls, review_date, status)
SELECT
  'Admin SPA CSP unsafe-inline / unsafe-eval',
  'Vite admin bundle requires inline scripts in dev; production CSP documents compensating controls.',
  'Strict admin auth, MFA on GRC, SRI on static assets where applicable, dependency scanning in CI.',
  (CURRENT_DATE + INTERVAL '90 days')::date,
  'active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.grc_exceptions e
  WHERE e.title = 'Admin SPA CSP unsafe-inline / unsafe-eval'
);
