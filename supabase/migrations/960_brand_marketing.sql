-- Brand marketing desk: briefs, campaigns, placements, metrics, snapshots.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS first_touch_utm_source text,
  ADD COLUMN IF NOT EXISTS first_touch_utm_medium text,
  ADD COLUMN IF NOT EXISTS first_touch_utm_campaign text,
  ADD COLUMN IF NOT EXISTS first_touch_captured_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_users_first_touch_utm_campaign
  ON public.users (first_touch_utm_campaign)
  WHERE first_touch_utm_campaign IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.brand_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  go_live_budget_threshold numeric(14, 2) NOT NULL DEFAULT 50000,
  fiscal_year_start_month smallint NOT NULL DEFAULT 1
    CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  stale_metric_days smallint NOT NULL DEFAULT 7
    CHECK (stale_metric_days BETWEEN 1 AND 90),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_settings_tenant_unique UNIQUE (tenant_id)
);

CREATE TABLE IF NOT EXISTS public.brand_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  objective text,
  audience_notes text,
  market_notes text,
  budget_envelope numeric(14, 2),
  flight_start date,
  flight_end date,
  line_mix jsonb NOT NULL DEFAULT '[]'::jsonb,
  channels_requested text[] NOT NULL DEFAULT '{}',
  success_metric text NOT NULL DEFAULT 'demand'
    CHECK (success_metric IN ('demand', 'supply')),
  success_target numeric(14, 2),
  template_key text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'in_review', 'changes_requested', 'accepted', 'rejected', 'parked')),
  notes text,
  attachment_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  group_code text,
  author_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewer_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  accepted_campaign_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brand_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  brief_id uuid REFERENCES public.brand_briefs(id) ON DELETE SET NULL,
  name text NOT NULL,
  objective text,
  stage text NOT NULL DEFAULT 'planning'
    CHECK (stage IN ('planning', 'creative', 'live', 'measuring', 'closed')),
  owner_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  tracking_code text NOT NULL,
  group_code text,
  budget_envelope numeric(14, 2),
  flight_start date,
  flight_end date,
  line_mix jsonb NOT NULL DEFAULT '[]'::jsonb,
  success_metric text NOT NULL DEFAULT 'demand'
    CHECK (success_metric IN ('demand', 'supply')),
  success_target numeric(14, 2),
  audience_definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  live_confirmed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  live_confirmed_at timestamptz,
  closeout_worked text,
  closeout_did_not text,
  closeout_run_again text,
  cloned_from_id uuid REFERENCES public.brand_campaigns(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_campaigns_tracking_code_unique UNIQUE (tracking_code)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_brand_campaigns_tracking_code_lower
  ON public.brand_campaigns (lower(tracking_code));

ALTER TABLE public.brand_briefs
  ADD CONSTRAINT brand_briefs_accepted_campaign_fk
  FOREIGN KEY (accepted_campaign_id) REFERENCES public.brand_campaigns(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.brand_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.brand_campaigns(id) ON DELETE CASCADE,
  channel_key text NOT NULL,
  line_type text NOT NULL DEFAULT 'paid'
    CHECK (line_type IN ('paid', 'influencer', 'offline', 'owned', 'production', 'research', 'sponsorship', 'event')),
  name text,
  owner_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  budget numeric(14, 2),
  tracking_code text,
  flight_start date,
  flight_end date,
  promotion_id uuid REFERENCES public.promotions(id) ON DELETE SET NULL,
  coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL,
  referral_code text,
  referral_program boolean NOT NULL DEFAULT false,
  broadcast_log_id uuid REFERENCES public.broadcast_logs(id) ON DELETE SET NULL,
  ads_campaign_id uuid REFERENCES public.ads_campaigns(id) ON DELETE SET NULL,
  waitlist_city text,
  waitlist_persona text,
  external_campaign_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_metric_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_placements_tenant ON public.brand_placements (tenant_id);
CREATE INDEX IF NOT EXISTS idx_brand_placements_campaign ON public.brand_placements (campaign_id);
CREATE INDEX IF NOT EXISTS idx_brand_placements_tracking_code ON public.brand_placements (tracking_code);

CREATE TABLE IF NOT EXISTS public.brand_metric_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  placement_id uuid NOT NULL REFERENCES public.brand_placements(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  value numeric(18, 4) NOT NULL,
  unit text NOT NULL DEFAULT 'count',
  original_currency text,
  original_amount numeric(18, 4),
  converted_amount numeric(18, 4),
  as_of date NOT NULL DEFAULT CURRENT_DATE,
  source text NOT NULL DEFAULT 'entered'
    CHECK (source IN ('measured', 'entered', 'amplitude_pointer')),
  confidence text NOT NULL DEFAULT 'entered'
    CHECK (confidence IN ('measured', 'entered', 'estimated', 'unattributable', 'amplitude')),
  author_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  supersedes_id uuid REFERENCES public.brand_metric_entries(id) ON DELETE SET NULL,
  voided boolean NOT NULL DEFAULT false,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_metric_entries_placement ON public.brand_metric_entries (placement_id, metric_key, as_of DESC);

CREATE TABLE IF NOT EXISTS public.brand_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  brief_id uuid REFERENCES public.brand_briefs(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.brand_campaigns(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  body text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_campaigns_tenant_stage ON public.brand_campaigns (tenant_id, stage);

CREATE TABLE IF NOT EXISTS public.brand_period_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_kind text NOT NULL CHECK (period_kind IN ('week', 'month', 'quarter', 'year', 'group')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_period_snapshots_unique UNIQUE (tenant_id, period_kind, period_start, period_end)
);

INSERT INTO public.brand_settings (tenant_id, go_live_budget_threshold, fiscal_year_start_month, stale_metric_days)
SELECT NULL, 50000, 1, 7
WHERE NOT EXISTS (SELECT 1 FROM public.brand_settings WHERE tenant_id IS NULL);

INSERT INTO public.feature_flags (feature_key, feature_name, description, enabled, category, tenant_id)
SELECT
  'brand_desk',
  'Brand desk',
  'Integrated brand marketing workflow: briefs, campaign board, pack, and period reporting.',
  false,
  'marketing',
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.feature_flags WHERE feature_key = 'brand_desk' AND tenant_id IS NULL
);

-- Service-role only (admin API uses getSupabaseAdmin).
ALTER TABLE public.brand_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_metric_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_period_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brand_settings_service ON public.brand_settings;
CREATE POLICY brand_settings_service ON public.brand_settings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS brand_briefs_service ON public.brand_briefs;
CREATE POLICY brand_briefs_service ON public.brand_briefs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS brand_campaigns_service ON public.brand_campaigns;
CREATE POLICY brand_campaigns_service ON public.brand_campaigns FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS brand_placements_service ON public.brand_placements;
CREATE POLICY brand_placements_service ON public.brand_placements FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS brand_metric_entries_service ON public.brand_metric_entries;
CREATE POLICY brand_metric_entries_service ON public.brand_metric_entries FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS brand_activity_service ON public.brand_activity;
CREATE POLICY brand_activity_service ON public.brand_activity FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS brand_period_snapshots_service ON public.brand_period_snapshots;
CREATE POLICY brand_period_snapshots_service ON public.brand_period_snapshots FOR ALL USING (true) WITH CHECK (true);
