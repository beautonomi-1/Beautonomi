-- Migration 749: Terminal orders
--
-- Provider-facing purchase/rental/bundle orders for terminal products.
-- Each order posts to finance_transactions for accounting.

CREATE TYPE terminal_order_status AS ENUM (
  'pending',
  'confirmed',
  'processing',
  'dispatched',
  'delivered',
  'cancelled',
  'refunded',
  'failed'
);

CREATE TYPE terminal_commercial_model AS ENUM (
  'once_off_purchase',
  'rental',
  'subscription_bundle',
  'lease_to_own',
  'financed',
  'promotional'
);

CREATE TYPE terminal_fulfillment_status AS ENUM (
  'pending',
  'picking',
  'packed',
  'dispatched',
  'delivered',
  'returned',
  'failed'
);

CREATE TYPE terminal_invoice_status AS ENUM (
  'pending',
  'issued',
  'paid',
  'void',
  'refunded'
);

CREATE TYPE terminal_accounting_sync_status AS ENUM (
  'pending',
  'posted',
  'error',
  'skipped'
);

CREATE TABLE IF NOT EXISTS public.terminal_orders (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_id                 UUID NOT NULL
    REFERENCES public.providers(id) ON DELETE CASCADE,
  product_id                  UUID
    REFERENCES public.terminal_products(id) ON DELETE SET NULL,

  -- Order state
  order_status                terminal_order_status NOT NULL DEFAULT 'pending',
  commercial_model            terminal_commercial_model NOT NULL,

  -- Quantity + pricing
  quantity                    INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price                  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_amount                  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_amount                NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency                    TEXT NOT NULL DEFAULT 'ZAR',

  -- Delivery
  delivery_address            JSONB,

  -- Fulfillment
  fulfillment_status          terminal_fulfillment_status NOT NULL DEFAULT 'pending',

  -- Invoicing
  invoice_status              terminal_invoice_status NOT NULL DEFAULT 'pending',
  invoice_number              TEXT,

  -- Payment linkage
  paystack_reference          TEXT,
  finance_transaction_id      UUID
    REFERENCES public.finance_transactions(id) ON DELETE SET NULL,
  subscription_id             UUID
    REFERENCES public.provider_subscriptions(id) ON DELETE SET NULL,

  -- Accounting metadata
  revenue_category            TEXT,
  tax_code                    TEXT,
  gl_revenue_account          TEXT,
  gl_cogs_account             TEXT,
  gl_inventory_account        TEXT,
  gl_rental_income_account    TEXT,
  gl_deferred_account         TEXT,
  gl_promo_expense_account    TEXT,
  accounting_sync_status      terminal_accounting_sync_status NOT NULL DEFAULT 'pending',
  accounting_sync_error       TEXT,
  accounting_posted_at        TIMESTAMPTZ,

  -- Notes / internal
  admin_notes                 TEXT,
  cancellation_reason         TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_terminal_orders_tenant_id
  ON public.terminal_orders(tenant_id);

CREATE INDEX IF NOT EXISTS idx_terminal_orders_provider_id
  ON public.terminal_orders(provider_id);

CREATE INDEX IF NOT EXISTS idx_terminal_orders_order_status
  ON public.terminal_orders(order_status);

CREATE INDEX IF NOT EXISTS idx_terminal_orders_commercial_model
  ON public.terminal_orders(commercial_model);

CREATE INDEX IF NOT EXISTS idx_terminal_orders_accounting_sync
  ON public.terminal_orders(accounting_sync_status)
  WHERE accounting_sync_status IN ('pending', 'error');

CREATE OR REPLACE FUNCTION public.set_terminal_orders_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_terminal_orders_updated_at
  BEFORE UPDATE ON public.terminal_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_terminal_orders_updated_at();

ALTER TABLE public.terminal_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY terminal_orders_service_role ON public.terminal_orders
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Providers can only see their own orders
CREATE POLICY terminal_orders_provider_select ON public.terminal_orders
  FOR SELECT USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  );

COMMENT ON TABLE public.terminal_orders IS
  'Provider terminal purchase, rental, and subscription bundle orders. Linked to finance_transactions for accounting.';
