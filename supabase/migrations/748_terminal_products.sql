-- Migration 748: Terminal product catalog
--
-- Platform-managed catalog of card machines / payment terminals that can be
-- offered to providers via e-commerce, rental, or subscription bundles.

CREATE TYPE terminal_accounting_model AS ENUM (
  'once_off_purchase',
  'rental',
  'subscription_bundle',
  'lease_to_own',
  'promotional'
);

CREATE TYPE terminal_stock_status AS ENUM (
  'in_stock',
  'low_stock',
  'out_of_stock',
  'discontinued',
  'coming_soon'
);

CREATE TYPE terminal_fulfillment_type AS ENUM (
  'shipping',
  'courier',
  'collection',
  'digital_activation'
);

CREATE TABLE IF NOT EXISTS public.terminal_products (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID
    REFERENCES public.tenants(id) ON DELETE CASCADE,   -- NULL = platform-wide

  name                        TEXT NOT NULL,
  vendor                      TEXT NOT NULL,           -- e.g. 'yoco', 'ikhokha', 'beautonomi'
  model                       TEXT,
  description                 TEXT,
  image_url                   TEXT,
  device_type                 TEXT,                    -- 'card_machine', 'mpos', 'pos_terminal'

  -- Pricing
  currency                    TEXT NOT NULL DEFAULT 'ZAR',
  upfront_price               NUMERIC(12, 2),
  monthly_price               NUMERIC(12, 2),
  rental_price                NUMERIC(12, 2),
  subscription_plan_eligible  BOOLEAN NOT NULL DEFAULT false,

  -- Catalog control
  active                      BOOLEAN NOT NULL DEFAULT true,
  display_order               INTEGER NOT NULL DEFAULT 0,

  -- Commerce / accounting
  accounting_model            terminal_accounting_model,
  stock_status                terminal_stock_status NOT NULL DEFAULT 'in_stock',
  fulfillment_type            terminal_fulfillment_type,

  -- Finance / accounting reference fields
  sku                         TEXT,
  product_code                TEXT,
  gl_revenue_account          TEXT,
  gl_cogs_account             TEXT,
  gl_inventory_account        TEXT,
  gl_rental_income_account    TEXT,
  tax_code                    TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_terminal_products_tenant_id
  ON public.terminal_products(tenant_id);

CREATE INDEX IF NOT EXISTS idx_terminal_products_active
  ON public.terminal_products(active, display_order);

CREATE OR REPLACE FUNCTION public.set_terminal_products_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_terminal_products_updated_at
  BEFORE UPDATE ON public.terminal_products
  FOR EACH ROW EXECUTE FUNCTION public.set_terminal_products_updated_at();

ALTER TABLE public.terminal_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY terminal_products_service_role ON public.terminal_products
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Providers (and public) can read active products
CREATE POLICY terminal_products_select ON public.terminal_products
  FOR SELECT USING (active = true);

COMMENT ON TABLE public.terminal_products IS
  'Platform-managed catalog of card machines / payment terminals for provider e-commerce, rental, and subscription bundles.';
