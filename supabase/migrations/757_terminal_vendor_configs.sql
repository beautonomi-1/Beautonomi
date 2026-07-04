-- Migration 757: Terminal vendor configuration catalog
--
-- Superadmin-managed table of supported terminal vendors.
-- Adding a new vendor = one INSERT here + a feature flag row.
-- No schema migration required for each new vendor.
--
-- Seeded with: Wappoint, iKhokha, FNB, Capitec, Nedbank, Absa, Standard Bank.
-- Yoco is intentionally excluded here — Yoco has its own deep integration
-- (provider_yoco_integrations, OAuth, devices) and is gated by payment_yoco.

-- ── 1. Table ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.terminal_vendor_configs (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NULL = global config; non-NULL = tenant override
  tenant_id                   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Lowercase slug — must match provider_terminal_integrations.vendor
  vendor                      TEXT NOT NULL,

  -- Display
  display_name                TEXT NOT NULL,
  description                 TEXT,
  logo_url                    TEXT,
  help_url                    TEXT,

  -- Availability
  enabled                     BOOLEAN NOT NULL DEFAULT false,

  -- Supported credential modes for this vendor (e.g. ARRAY['api_key', 'oauth'])
  credential_modes            TEXT[] NOT NULL DEFAULT ARRAY['api_key'],

  -- OAuth config (populated by Superadmin when vendor supports OAuth)
  oauth_authorize_url         TEXT,
  oauth_token_url             TEXT,
  oauth_revoke_url            TEXT,
  oauth_client_id             TEXT,
  oauth_client_secret         TEXT,   -- encrypted at rest
  oauth_scopes                TEXT,
  oauth_redirect_path         TEXT    DEFAULT '/api/provider/terminal-integrations/oauth/callback',

  -- API config
  api_base_url                TEXT,
  api_docs_url                TEXT,
  webhook_receive_path        TEXT,   -- e.g. '/api/webhooks/terminal/wappoint'
  requires_merchant_id        BOOLEAN NOT NULL DEFAULT false,
  requires_webhook_setup      BOOLEAN NOT NULL DEFAULT false,

  -- Setup
  setup_instructions_url      TEXT,
  setup_instructions_text     TEXT,   -- short markdown snippet shown in provider UI

  -- Feature flag key for this vendor (e.g. 'terminal_vendor_wappoint_enabled')
  feature_flag_key            TEXT,

  -- Metadata (e.g. test card numbers, environment URLs, etc.)
  metadata                    JSONB DEFAULT '{}',

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Global vendors are unique on vendor alone; tenant overrides on (tenant_id, vendor)
  CONSTRAINT uq_tvc_global_vendor UNIQUE NULLS NOT DISTINCT (tenant_id, vendor)
);

CREATE INDEX IF NOT EXISTS idx_tvc_vendor  ON public.terminal_vendor_configs(vendor);
CREATE INDEX IF NOT EXISTS idx_tvc_enabled ON public.terminal_vendor_configs(enabled) WHERE enabled = true;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_tvc_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_tvc_updated_at
  BEFORE UPDATE ON public.terminal_vendor_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_tvc_updated_at();

-- ── 2. RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.terminal_vendor_configs ENABLE ROW LEVEL SECURITY;

-- Everyone (including providers) can read active vendor configs
CREATE POLICY tvc_select_all ON public.terminal_vendor_configs
  FOR SELECT USING (true);

-- Only service role can mutate
CREATE POLICY tvc_service_role_all ON public.terminal_vendor_configs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 3. Seed: global vendor entries ────────────────────────────────────────────
-- Enabled = false by default — Superadmin turns on per-vendor when ready.
-- Wappoint is seeded first as it is the flagship generic integration target.

INSERT INTO public.terminal_vendor_configs
  (vendor, display_name, description, credential_modes, enabled,
   requires_merchant_id, feature_flag_key, api_docs_url, setup_instructions_text)
VALUES
  (
    'wappoint',
    'Wappoint',
    'South African point-of-sale and card machine platform with API integration support.',
    ARRAY['api_key'],
    false,
    true,
    'terminal_vendor_wappoint_enabled',
    'https://docs.wappoint.co.za',
    'Enter your Wappoint API key and merchant ID from your Wappoint dashboard. Enable the integration to link your terminals.'
  ),
  (
    'ikhokha',
    'iKhokha',
    'Affordable card machine solution for South African businesses.',
    ARRAY['api_key'],
    false,
    true,
    'terminal_vendor_ikhokha_enabled',
    'https://developer.ikhokha.com',
    'Enter your iKhokha merchant ID and API key from the iKhokha merchant portal.'
  ),
  (
    'fnb',
    'FNB (First National Bank)',
    'FNB merchant services payment terminal integration.',
    ARRAY['api_key', 'manual'],
    false,
    true,
    'terminal_vendor_fnb_enabled',
    NULL,
    'Enter your FNB merchant ID provided by your business banker. Contact FNB merchant services to obtain an API key.'
  ),
  (
    'capitec',
    'Capitec',
    'Capitec merchant payment terminal integration.',
    ARRAY['api_key', 'manual'],
    false,
    true,
    'terminal_vendor_capitec_enabled',
    NULL,
    'Enter your Capitec merchant number. Contact Capitec business banking for API access.'
  ),
  (
    'nedbank',
    'Nedbank',
    'Nedbank merchant services card machine integration.',
    ARRAY['api_key', 'manual'],
    false,
    true,
    'terminal_vendor_nedbank_enabled',
    NULL,
    'Enter your Nedbank merchant ID from your Nedbank business account.'
  ),
  (
    'absa',
    'Absa',
    'Absa merchant services payment terminal integration.',
    ARRAY['api_key', 'manual'],
    false,
    true,
    'terminal_vendor_absa_enabled',
    NULL,
    'Enter your Absa merchant number from your Absa business account.'
  ),
  (
    'standard_bank',
    'Standard Bank',
    'Standard Bank merchant services card machine integration.',
    ARRAY['api_key', 'manual'],
    false,
    true,
    'terminal_vendor_standard_bank_enabled',
    NULL,
    'Enter your Standard Bank merchant ID from your Standard Bank business account.'
  )
ON CONFLICT (tenant_id, vendor) DO NOTHING;

-- ── 4. Comments ────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.terminal_vendor_configs IS
  'Superadmin-managed catalog of supported payment terminal vendors.
   Adding a new vendor = one INSERT + feature flag, no schema changes.
   tenant_id = NULL means global config; non-NULL overrides for specific tenants.';

COMMENT ON COLUMN public.terminal_vendor_configs.vendor IS
  'Lowercase snake_case slug matching provider_terminal_integrations.vendor.';

COMMENT ON COLUMN public.terminal_vendor_configs.feature_flag_key IS
  'Feature flag key (from feature_flags table) that gates this vendor in the UI and API.
   When the flag is disabled, providers cannot connect this vendor.';
