-- Brand desk workflow: approvals, checklists, strategy, creative assets, brief versions, tasks.

ALTER TABLE public.brand_settings
  ADD COLUMN IF NOT EXISTS self_approve_below numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approval_sla_hours smallint NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS default_approvers jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.brand_briefs
  ADD COLUMN IF NOT EXISTS campaign_type text NOT NULL DEFAULT 'brand_awareness',
  ADD COLUMN IF NOT EXISTS schema_key text NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS schema_version smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS quality_score smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS field_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pillar_id uuid,
  ADD COLUMN IF NOT EXISTS plan_id uuid,
  ADD COLUMN IF NOT EXISTS background text,
  ADD COLUMN IF NOT EXISTS business_problem text,
  ADD COLUMN IF NOT EXISTS insight text,
  ADD COLUMN IF NOT EXISTS proposition text,
  ADD COLUMN IF NOT EXISTS reasons_to_believe text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tone text,
  ADD COLUMN IF NOT EXISTS mandatories text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS deliverables jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS key_dates jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS stakeholders jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS audience jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.brand_campaigns
  ADD COLUMN IF NOT EXISTS pillar_id uuid,
  ADD COLUMN IF NOT EXISTS plan_id uuid,
  ADD COLUMN IF NOT EXISTS go_live_pending_approval_id uuid;

CREATE TABLE IF NOT EXISTS public.brand_strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  year smallint NOT NULL,
  positioning text,
  brand_promise text,
  audience_priorities jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_strategies_tenant_year UNIQUE (tenant_id, year)
);

CREATE TABLE IF NOT EXISTS public.brand_pillars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  strategy_id uuid NOT NULL REFERENCES public.brand_strategies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  kpi_key text,
  kpi_target numeric(18, 4),
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brand_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pillar_id uuid NOT NULL REFERENCES public.brand_pillars(id) ON DELETE CASCADE,
  year smallint NOT NULL,
  quarter smallint NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  budget numeric(14, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_plans_pillar_quarter UNIQUE (pillar_id, year, quarter)
);

ALTER TABLE public.brand_briefs
  ADD CONSTRAINT brand_briefs_pillar_fk FOREIGN KEY (pillar_id) REFERENCES public.brand_pillars(id) ON DELETE SET NULL;
ALTER TABLE public.brand_briefs
  ADD CONSTRAINT brand_briefs_plan_fk FOREIGN KEY (plan_id) REFERENCES public.brand_plans(id) ON DELETE SET NULL;

ALTER TABLE public.brand_campaigns
  ADD CONSTRAINT brand_campaigns_pillar_fk FOREIGN KEY (pillar_id) REFERENCES public.brand_pillars(id) ON DELETE SET NULL;
ALTER TABLE public.brand_campaigns
  ADD CONSTRAINT brand_campaigns_plan_fk FOREIGN KEY (plan_id) REFERENCES public.brand_plans(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.brand_campaign_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  type_key text NOT NULL,
  label text NOT NULL,
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_campaign_types_unique UNIQUE (tenant_id, type_key)
);

CREATE TABLE IF NOT EXISTS public.brand_brief_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  brief_id uuid NOT NULL REFERENCES public.brand_briefs(id) ON DELETE CASCADE,
  version_number int NOT NULL,
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text NOT NULL,
  editor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_brief_versions_unique UNIQUE (brief_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.brand_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  version_hash text NOT NULL,
  prev_hash text,
  requested_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approver_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  guest_email text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'changes_requested', 'rejected', 'expired')),
  comment text,
  due_at timestamptz,
  decided_at timestamptz,
  guest_token_hash text,
  guest_token_expires_at timestamptz,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_approvals_subject ON public.brand_approvals (tenant_id, subject_type, subject_id, status);

CREATE TABLE IF NOT EXISTS public.brand_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  stage text NOT NULL,
  channel_key text,
  label text NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_checklist_templates_unique UNIQUE (tenant_id, template_key, stage, channel_key, label)
);

CREATE TABLE IF NOT EXISTS public.brand_checklist_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.brand_campaigns(id) ON DELETE CASCADE,
  template_key text,
  stage text NOT NULL,
  label text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  completed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brand_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.brand_campaigns(id) ON DELETE CASCADE,
  brief_id uuid REFERENCES public.brand_briefs(id) ON DELETE CASCADE,
  title text NOT NULL,
  owner_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  due_at date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brand_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.brand_campaigns(id) ON DELETE CASCADE,
  placement_id uuid REFERENCES public.brand_placements(id) ON DELETE SET NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'approved', 'rejected')),
  rights_holder text,
  rights_expires_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brand_asset_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.brand_assets(id) ON DELETE CASCADE,
  version_number int NOT NULL,
  storage_path text NOT NULL,
  sha256 text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  uploaded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_asset_versions_unique UNIQUE (asset_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.brand_proof_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.brand_asset_versions(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  pos_x numeric(8, 4),
  pos_y numeric(8, 4),
  timecode_sec numeric(10, 2),
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brand_evidence_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  label text NOT NULL,
  period_start date,
  period_end date,
  campaign_id uuid REFERENCES public.brand_campaigns(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued',
  manifest_hash text,
  storage_path text,
  requested_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz
);

-- RLS service role (match 963)
ALTER TABLE public.brand_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_pillars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_campaign_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_brief_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_checklist_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_asset_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_proof_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_evidence_packs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'brand_strategies','brand_pillars','brand_plans','brand_campaign_types',
    'brand_brief_versions','brand_approvals','brand_checklist_templates',
    'brand_checklist_instances','brand_tasks','brand_assets','brand_asset_versions',
    'brand_proof_comments','brand_evidence_packs'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_service', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true)', t || '_service', t);
  END LOOP;
END $$;

-- Append-only on versions and activity kinds (approvals allow status updates only via application)
CREATE OR REPLACE FUNCTION public.brand_prevent_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Append-only table';
END;
$$;

DROP TRIGGER IF EXISTS brand_brief_versions_no_update ON public.brand_brief_versions;
CREATE TRIGGER brand_brief_versions_no_update
  BEFORE UPDATE OR DELETE ON public.brand_brief_versions
  FOR EACH ROW EXECUTE FUNCTION public.brand_prevent_mutation();

DROP TRIGGER IF EXISTS brand_asset_versions_no_update ON public.brand_asset_versions;
CREATE TRIGGER brand_asset_versions_no_update
  BEFORE UPDATE OR DELETE ON public.brand_asset_versions
  FOR EACH ROW EXECUTE FUNCTION public.brand_prevent_mutation();

INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-assets', 'brand-assets', false)
ON CONFLICT (id) DO NOTHING;
