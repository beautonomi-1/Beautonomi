-- Migration 758: Generic provider terminal devices
--
-- Tracks individual card machines / payment terminals connected to a provider
-- via any vendor integration. Mirrors provider_yoco_devices but is generic.
-- One row per physical device per provider.

CREATE TYPE terminal_device_status AS ENUM (
  'active',
  'inactive',
  'lost',
  'returned',
  'decommissioned'
);

CREATE TABLE IF NOT EXISTS public.provider_terminal_devices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_id         UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  integration_id      UUID REFERENCES public.provider_terminal_integrations(id) ON DELETE SET NULL,

  -- Vendor link
  vendor              TEXT NOT NULL,

  -- Device identity
  device_id           TEXT,         -- vendor-assigned device identifier
  device_name         TEXT,
  serial_number       TEXT,
  model               TEXT,
  firmware_version    TEXT,

  -- Status
  status              terminal_device_status NOT NULL DEFAULT 'active',
  is_active           BOOLEAN NOT NULL DEFAULT true,

  -- Usage stats (updated by webhooks / reconcile jobs)
  last_used_at        TIMESTAMPTZ,
  total_transactions  INTEGER DEFAULT 0,
  total_amount        BIGINT DEFAULT 0,   -- in minor units (cents)
  currency            TEXT DEFAULT 'ZAR',

  -- Location
  location_id         TEXT,
  location_name       TEXT,

  -- Metadata (vendor-specific extra fields)
  metadata            JSONB DEFAULT '{}',

  -- Audit
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ptd_provider_id    ON public.provider_terminal_devices(provider_id);
CREATE INDEX IF NOT EXISTS idx_ptd_tenant_id      ON public.provider_terminal_devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ptd_vendor         ON public.provider_terminal_devices(vendor);
CREATE INDEX IF NOT EXISTS idx_ptd_integration_id ON public.provider_terminal_devices(integration_id);

CREATE OR REPLACE FUNCTION public.set_ptd_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_ptd_updated_at
  BEFORE UPDATE ON public.provider_terminal_devices
  FOR EACH ROW EXECUTE FUNCTION public.set_ptd_updated_at();

ALTER TABLE public.provider_terminal_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY ptd_provider_select ON public.provider_terminal_devices
  FOR SELECT
  USING (provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid()));

CREATE POLICY ptd_provider_insert ON public.provider_terminal_devices
  FOR INSERT
  WITH CHECK (provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid()));

CREATE POLICY ptd_provider_update ON public.provider_terminal_devices
  FOR UPDATE
  USING (provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid()));

CREATE POLICY ptd_provider_delete ON public.provider_terminal_devices
  FOR DELETE
  USING (provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid()));

CREATE POLICY ptd_service_role_all ON public.provider_terminal_devices
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.provider_terminal_devices IS
  'Generic physical terminal / card machine device tracking. One row per device per provider. Supports any vendor in terminal_vendor_configs.';
