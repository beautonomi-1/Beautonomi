-- GRC frameworks, requirements, controls, SoA

CREATE TABLE IF NOT EXISTS public.grc_frameworks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.grc_requirements (
  id TEXT PRIMARY KEY,
  framework_id TEXT NOT NULL REFERENCES public.grc_frameworks(id) ON DELETE CASCADE,
  ref_code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.grc_controls (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  owner_team TEXT,
  owner_user_id UUID REFERENCES public.users(id),
  status TEXT NOT NULL DEFAULT 'not_started',
  collector_key TEXT,
  auditor_note TEXT,
  example_evidence TEXT,
  created_by UUID REFERENCES public.users(id),
  updated_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.grc_control_requirements (
  control_id TEXT NOT NULL REFERENCES public.grc_controls(id) ON DELETE CASCADE,
  requirement_id TEXT NOT NULL REFERENCES public.grc_requirements(id) ON DELETE CASCADE,
  PRIMARY KEY (control_id, requirement_id)
);

CREATE TABLE IF NOT EXISTS public.grc_soa_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  approved_by UUID REFERENCES public.users(id),
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.grc_soa_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  soa_version_id UUID NOT NULL REFERENCES public.grc_soa_versions(id) ON DELETE CASCADE,
  requirement_id TEXT NOT NULL REFERENCES public.grc_requirements(id),
  applicable BOOLEAN NOT NULL DEFAULT true,
  justification TEXT,
  control_id TEXT REFERENCES public.grc_controls(id),
  UNIQUE (soa_version_id, requirement_id)
);

ALTER TABLE public.grc_frameworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_control_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_soa_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_soa_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY grc_frameworks_select ON public.grc_frameworks FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.controls.view'));
CREATE POLICY grc_controls_select ON public.grc_controls FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.controls.view'));
CREATE POLICY grc_controls_write ON public.grc_controls FOR ALL TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.controls.edit'))
  WITH CHECK (public.grc_has_permission(auth.uid(), 'grc.controls.edit'));

CREATE POLICY grc_requirements_select ON public.grc_requirements FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.controls.view'));
CREATE POLICY grc_control_req_select ON public.grc_control_requirements FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.controls.view'));
CREATE POLICY grc_soa_select ON public.grc_soa_versions FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.controls.view'));
CREATE POLICY grc_soa_write ON public.grc_soa_versions FOR ALL TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.controls.edit'))
  WITH CHECK (public.grc_has_permission(auth.uid(), 'grc.controls.edit'));
CREATE POLICY grc_soa_entries_select ON public.grc_soa_entries FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.controls.view'));
CREATE POLICY grc_soa_entries_write ON public.grc_soa_entries FOR ALL TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.controls.edit'))
  WITH CHECK (public.grc_has_permission(auth.uid(), 'grc.controls.edit'));
