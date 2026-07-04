-- Migration 756: Generic provider terminal integrations
--
-- Vendor-agnostic integration table so any card machine / payment terminal
-- vendor (Wappoint, iKhokha, FNB, Capitec, etc.) can be connected by a
-- provider without new migrations — just a new row with a different `vendor`
-- value.  Mirrors `provider_yoco_integrations` but is not Yoco-specific.
--
-- Relationship: one row per (provider_id, vendor) pair.
-- Credentials are stored server-side only; RLS prevents cross-provider reads.

-- ── 1. Enum types ──────────────────────────────────────────────────────────────

CREATE TYPE terminal_credential_mode AS ENUM (
  'none',
  'api_key',
  'oauth',
  'manual'
);

CREATE TYPE terminal_integration_environment AS ENUM (
  'sandbox',
  'live'
);

CREATE TYPE terminal_integration_status AS ENUM (
  'not_connected',
  'pending_verification',
  'connected',
  'error',
  'suspended'
);

-- ── 2. provider_terminal_integrations ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.provider_terminal_integrations (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     UUID NOT NULL
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_id                   UUID NOT NULL
    REFERENCES public.providers(id) ON DELETE CASCADE,

  -- Vendor identifier — e.g. 'wappoint', 'ikhokha', 'fnb', 'capitec', 'yoco_generic'
  -- Kept as TEXT (not enum) so new vendors are added via terminal_vendor_configs, not migrations.
  vendor                        TEXT NOT NULL,

  -- Connection state
  status                        terminal_integration_status NOT NULL DEFAULT 'not_connected',
  credential_mode               terminal_credential_mode NOT NULL DEFAULT 'none',
  environment                   terminal_integration_environment NOT NULL DEFAULT 'live',

  -- API Key credentials (stored only when credential_mode = 'api_key')
  api_key                       TEXT,
  api_secret                    TEXT,
  public_key                    TEXT,
  webhook_secret                TEXT,

  -- OAuth credentials (stored when credential_mode = 'oauth')
  oauth_access_token            TEXT,
  oauth_refresh_token           TEXT,
  oauth_token_type              TEXT DEFAULT 'bearer',
  oauth_scope                   TEXT,
  oauth_expires_at              TIMESTAMPTZ,
  oauth_refresh_expires_at      TIMESTAMPTZ,

  -- Vendor-issued merchant identifiers
  merchant_id                   TEXT,
  merchant_ref                  TEXT,
  business_name                 TEXT,

  -- Integration metadata (vendor-specific fields, device count, etc.)
  metadata                      JSONB DEFAULT '{}',

  -- UX state
  reconnect_banner_dismissed_at TIMESTAMPTZ,
  is_enabled                    BOOLEAN NOT NULL DEFAULT false,
  connected_at                  TIMESTAMPTZ,
  last_sync_at                  TIMESTAMPTZ,
  last_error                    TEXT,

  -- Audit
  created_by                    UUID REFERENCES public.users(id),
  updated_by                    UUID REFERENCES public.users(id),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_pti_provider_vendor UNIQUE (provider_id, vendor)
);

-- ── 3. Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pti_provider_id  ON public.provider_terminal_integrations(provider_id);
CREATE INDEX IF NOT EXISTS idx_pti_tenant_id    ON public.provider_terminal_integrations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pti_vendor       ON public.provider_terminal_integrations(vendor);
CREATE INDEX IF NOT EXISTS idx_pti_status       ON public.provider_terminal_integrations(status);

-- ── 4. updated_at trigger ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_pti_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pti_updated_at
  BEFORE UPDATE ON public.provider_terminal_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_pti_updated_at();

-- ── 5. Row-Level Security ──────────────────────────────────────────────────────

ALTER TABLE public.provider_terminal_integrations ENABLE ROW LEVEL SECURITY;

-- Provider reads their own integrations only
CREATE POLICY pti_provider_select ON public.provider_terminal_integrations
  FOR SELECT
  USING (
    provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
    )
  );

-- Provider can insert their own
CREATE POLICY pti_provider_insert ON public.provider_terminal_integrations
  FOR INSERT
  WITH CHECK (
    provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
    )
  );

-- Provider can update their own
CREATE POLICY pti_provider_update ON public.provider_terminal_integrations
  FOR UPDATE
  USING (
    provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
    )
  );

-- Provider can delete their own (disconnect)
CREATE POLICY pti_provider_delete ON public.provider_terminal_integrations
  FOR DELETE
  USING (
    provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
    )
  );

-- Service role (Superadmin, API) bypasses all RLS
CREATE POLICY pti_service_role_all ON public.provider_terminal_integrations
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 6. Comments ────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.provider_terminal_integrations IS
  'Vendor-agnostic table for provider card machine / payment terminal integrations.
   Each row represents a single vendor connection for a provider.
   New vendors are added via terminal_vendor_configs without schema changes.
   Mirrors provider_yoco_integrations but is not vendor-specific.';

COMMENT ON COLUMN public.provider_terminal_integrations.vendor IS
  'Vendor slug (lowercase, snake_case): wappoint, ikhokha, fnb, capitec, absa, nedbank, standard_bank, psp, other. Must match terminal_vendor_configs.vendor.';

COMMENT ON COLUMN public.provider_terminal_integrations.credential_mode IS
  'none = not yet connected; api_key = dashboard key paste; oauth = vendor OAuth 2.0; manual = verified offline.';

COMMENT ON COLUMN public.provider_terminal_integrations.metadata IS
  'Vendor-specific fields (e.g. Wappoint: location_id, branch_code; iKhokha: merchant_category).';
