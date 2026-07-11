-- Migration 776: Terminal upsell pipeline for superadmin commercial ops
--
-- Tracks sales outreach to providers who have no card machine and are not on a
-- subscription plan that includes a terminal bundle.

CREATE TABLE IF NOT EXISTS public.terminal_upsell_leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_id   UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'quoted', 'won', 'lost', 'dismissed')),
  assigned_to   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  notes         TEXT,
  lost_reason   TEXT,
  source        TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('auto_segment', 'manual')),
  created_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_terminal_upsell_leads_tenant_status
  ON public.terminal_upsell_leads(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_terminal_upsell_leads_assigned
  ON public.terminal_upsell_leads(assigned_to)
  WHERE assigned_to IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.terminal_upsell_lead_activities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES public.terminal_upsell_leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL
    CHECK (activity_type IN ('created', 'status_changed', 'assigned', 'note')),
  description   TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}',
  performed_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_terminal_upsell_lead_activities_lead
  ON public.terminal_upsell_lead_activities(lead_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_terminal_upsell_leads_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_terminal_upsell_leads_updated_at
  BEFORE UPDATE ON public.terminal_upsell_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_terminal_upsell_leads_updated_at();

ALTER TABLE public.terminal_upsell_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terminal_upsell_lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY terminal_upsell_leads_service_role ON public.terminal_upsell_leads
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY terminal_upsell_lead_activities_service_role ON public.terminal_upsell_lead_activities
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.terminal_upsell_leads IS
  'Superadmin terminal upsell pipeline — one row per provider sales opportunity.';
COMMENT ON TABLE public.terminal_upsell_lead_activities IS
  'Audit timeline for terminal upsell lead status, assignment, and notes.';
