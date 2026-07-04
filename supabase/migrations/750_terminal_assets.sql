-- Migration 750: Terminal assets (physical device tracking per provider)

CREATE TYPE terminal_asset_status AS ENUM (
  'ordered',
  'dispatched',
  'delivered',
  'active',
  'returned',
  'lost',
  'damaged',
  'cancelled'
);

CREATE TYPE terminal_asset_ownership_model AS ENUM (
  'provider_owned',
  'platform_owned',
  'rented',
  'leased',
  'subscription_included'
);

CREATE TABLE IF NOT EXISTS public.terminal_assets (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_id                 UUID NOT NULL
    REFERENCES public.providers(id) ON DELETE CASCADE,
  product_id                  UUID
    REFERENCES public.terminal_products(id) ON DELETE SET NULL,
  order_id                    UUID
    REFERENCES public.terminal_orders(id) ON DELETE SET NULL,

  serial_number               TEXT,
  status                      terminal_asset_status NOT NULL DEFAULT 'ordered',
  ownership_model             terminal_asset_ownership_model NOT NULL,
  assigned_subscription_plan_id UUID
    REFERENCES public.subscription_plans(id) ON DELETE SET NULL,

  -- Accounting / finance
  accounting_treatment        TEXT,
  asset_value                 NUMERIC(12, 2),
  accumulated_depreciation    NUMERIC(12, 2),
  gl_asset_account            TEXT,
  finance_transaction_id      UUID
    REFERENCES public.finance_transactions(id) ON DELETE SET NULL,

  -- Lifecycle timestamps
  activated_at                TIMESTAMPTZ,
  returned_at                 TIMESTAMPTZ,

  -- Admin notes
  admin_notes                 TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_terminal_assets_tenant_id
  ON public.terminal_assets(tenant_id);

CREATE INDEX IF NOT EXISTS idx_terminal_assets_provider_id
  ON public.terminal_assets(provider_id);

CREATE INDEX IF NOT EXISTS idx_terminal_assets_status
  ON public.terminal_assets(status);

CREATE OR REPLACE FUNCTION public.set_terminal_assets_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_terminal_assets_updated_at
  BEFORE UPDATE ON public.terminal_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_terminal_assets_updated_at();

ALTER TABLE public.terminal_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY terminal_assets_service_role ON public.terminal_assets
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY terminal_assets_provider_select ON public.terminal_assets
  FOR SELECT USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  );

COMMENT ON TABLE public.terminal_assets IS
  'Physical terminal device asset tracking per provider. Covers platform-owned (rented/subscribed) and provider-owned devices.';
