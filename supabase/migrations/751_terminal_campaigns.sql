-- Migration 751: Terminal campaigns + recipient tracking
--
-- Enables targeted broadcast campaigns to providers based on their terminal profile.
-- Links to broadcast_logs (existing) for delivery; this table stores the
-- targeting snapshot and conversion tracking.

CREATE TYPE terminal_campaign_status AS ENUM (
  'draft',
  'scheduled',
  'sending',
  'sent',
  'cancelled'
);

CREATE TABLE IF NOT EXISTS public.terminal_campaigns (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL
    REFERENCES public.tenants(id) ON DELETE CASCADE,

  name                    TEXT NOT NULL,
  description             TEXT,
  status                  terminal_campaign_status NOT NULL DEFAULT 'draft',

  -- Targeting criteria (snapshot at send time)
  target_criteria         JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- e.g. {"terminal_ownership_status": "no_terminal", "interested_in_platform_terminal": "yes"}

  -- CTA / content
  announcement_type       TEXT DEFAULT 'promotion',
  message_body            TEXT,
  cta_label               TEXT,
  cta_url                 TEXT,
  media_url               TEXT,
  expires_at              TIMESTAMPTZ,

  -- Delivery stats
  recipient_count         INTEGER NOT NULL DEFAULT 0,
  sent_count              INTEGER NOT NULL DEFAULT 0,
  click_count             INTEGER NOT NULL DEFAULT 0,
  conversion_count        INTEGER NOT NULL DEFAULT 0,
  opt_out_count           INTEGER NOT NULL DEFAULT 0,

  -- Link to broadcast
  broadcast_log_id        UUID,                  -- FK to broadcast_logs.id if available

  -- Admin
  created_by              UUID REFERENCES public.users(id),
  sent_at                 TIMESTAMPTZ,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.terminal_campaign_recipients (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id             UUID NOT NULL
    REFERENCES public.terminal_campaigns(id) ON DELETE CASCADE,
  provider_id             UUID NOT NULL
    REFERENCES public.providers(id) ON DELETE CASCADE,
  user_id                 UUID NOT NULL
    REFERENCES public.users(id) ON DELETE CASCADE,

  -- Delivery state
  delivered_at            TIMESTAMPTZ,
  clicked_at              TIMESTAMPTZ,
  converted_at            TIMESTAMPTZ,
  opted_out_at            TIMESTAMPTZ,

  -- Conversion context
  order_id                UUID
    REFERENCES public.terminal_orders(id) ON DELETE SET NULL,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (campaign_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_terminal_campaigns_tenant_id
  ON public.terminal_campaigns(tenant_id);

CREATE INDEX IF NOT EXISTS idx_terminal_campaigns_status
  ON public.terminal_campaigns(status);

CREATE INDEX IF NOT EXISTS idx_tcr_campaign_id
  ON public.terminal_campaign_recipients(campaign_id);

CREATE INDEX IF NOT EXISTS idx_tcr_provider_id
  ON public.terminal_campaign_recipients(provider_id);

-- opted-out providers query
CREATE INDEX IF NOT EXISTS idx_tcr_opted_out
  ON public.terminal_campaign_recipients(provider_id)
  WHERE opted_out_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_terminal_campaigns_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_terminal_campaigns_updated_at
  BEFORE UPDATE ON public.terminal_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_terminal_campaigns_updated_at();

ALTER TABLE public.terminal_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terminal_campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY terminal_campaigns_service_role ON public.terminal_campaigns
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY terminal_campaign_recipients_service_role ON public.terminal_campaign_recipients
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.terminal_campaigns IS
  'Platform-initiated terminal upsell/announcement campaigns targeting providers by terminal profile.';

COMMENT ON TABLE public.terminal_campaign_recipients IS
  'Per-provider delivery and conversion tracking for terminal campaigns.';
