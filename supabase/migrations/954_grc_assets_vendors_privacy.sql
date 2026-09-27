-- GRC assets, vendors, privacy processing records

CREATE TABLE IF NOT EXISTS public.grc_assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  description TEXT,
  owner_team TEXT,
  criticality TEXT NOT NULL DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.grc_data_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  source_asset_id TEXT REFERENCES public.grc_assets(id),
  dest_asset_id TEXT REFERENCES public.grc_assets(id),
  data_categories TEXT[],
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.grc_vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  service_type TEXT,
  data_processed TEXT,
  dpa_status TEXT,
  last_reviewed_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.grc_vendor_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id TEXT NOT NULL REFERENCES public.grc_vendors(id) ON DELETE CASCADE,
  assessed_at DATE NOT NULL DEFAULT CURRENT_DATE,
  outcome TEXT NOT NULL,
  notes TEXT,
  assessor_user_id UUID REFERENCES public.users(id)
);

CREATE TABLE IF NOT EXISTS public.grc_processing_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  purpose TEXT,
  lawful_basis TEXT,
  data_subjects TEXT,
  retention TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.grc_dpias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processing_activity_id UUID REFERENCES public.grc_processing_activities(id),
  status TEXT NOT NULL DEFAULT 'draft',
  summary TEXT,
  completed_at DATE,
  owner_user_id UUID REFERENCES public.users(id)
);

CREATE TABLE IF NOT EXISTS public.grc_data_subject_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  notes TEXT
);

ALTER TABLE public.grc_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_data_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_vendor_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_processing_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_dpias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_data_subject_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY grc_assets_select ON public.grc_assets FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.assets.view'));
CREATE POLICY grc_assets_write ON public.grc_assets FOR ALL TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.assets.edit'))
  WITH CHECK (public.grc_has_permission(auth.uid(), 'grc.assets.edit'));
CREATE POLICY grc_data_flows_select ON public.grc_data_flows FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.assets.view'));
CREATE POLICY grc_vendors_select ON public.grc_vendors FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.vendors.view'));
CREATE POLICY grc_vendors_write ON public.grc_vendors FOR ALL TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.vendors.edit'))
  WITH CHECK (public.grc_has_permission(auth.uid(), 'grc.vendors.edit'));
CREATE POLICY grc_vendor_assess_select ON public.grc_vendor_assessments FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.vendors.view'));
CREATE POLICY grc_privacy_select ON public.grc_processing_activities FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.privacy.view'));
CREATE POLICY grc_privacy_write ON public.grc_processing_activities FOR ALL TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.privacy.edit'))
  WITH CHECK (public.grc_has_permission(auth.uid(), 'grc.privacy.edit'));
CREATE POLICY grc_dpias_select ON public.grc_dpias FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.privacy.view'));
CREATE POLICY grc_dsr_select ON public.grc_data_subject_requests FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.privacy.view'));
