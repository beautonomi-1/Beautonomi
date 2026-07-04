-- ============================================================================
-- 766: Terminal order fulfillment snapshot + integration setup + pickup hubs
-- ============================================================================

-- Platform / tenant collection hubs for B2B terminal pickup
CREATE TABLE IF NOT EXISTS public.terminal_collection_locations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  address       JSONB NOT NULL DEFAULT '{}'::jsonb,
  active        BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_terminal_collection_locations_tenant
  ON public.terminal_collection_locations(tenant_id, active, display_order);

ALTER TABLE public.terminal_collection_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY terminal_collection_locations_service_role ON public.terminal_collection_locations
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY terminal_collection_locations_select ON public.terminal_collection_locations
  FOR SELECT USING (true);

-- Product integration setup flags
ALTER TABLE public.terminal_products
  ADD COLUMN IF NOT EXISTS requires_integration_setup BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.terminal_products
  ADD COLUMN IF NOT EXISTS integration_vendor_slug TEXT;

COMMENT ON COLUMN public.terminal_products.requires_integration_setup IS
  'When true, provider is prompted to complete vendor integration after order is paid/allocated.';

COMMENT ON COLUMN public.terminal_products.integration_vendor_slug IS
  'Vendor slug for integration setup URL; defaults to terminal_products.vendor when null.';

-- Order fulfillment snapshot + integration setup tracking
ALTER TABLE public.terminal_orders
  ADD COLUMN IF NOT EXISTS fulfillment_type public.terminal_fulfillment_type;

ALTER TABLE public.terminal_orders
  ADD COLUMN IF NOT EXISTS collection_location_id UUID
    REFERENCES public.terminal_collection_locations(id) ON DELETE SET NULL;

ALTER TABLE public.terminal_orders
  ADD COLUMN IF NOT EXISTS tracking_reference TEXT;

ALTER TABLE public.terminal_orders
  ADD COLUMN IF NOT EXISTS courier_name TEXT;

ALTER TABLE public.terminal_orders
  ADD COLUMN IF NOT EXISTS integration_setup_status TEXT NOT NULL DEFAULT 'not_required';

ALTER TABLE public.terminal_orders
  ADD COLUMN IF NOT EXISTS integration_completed_at TIMESTAMPTZ;

ALTER TABLE public.terminal_orders
  DROP CONSTRAINT IF EXISTS terminal_orders_integration_setup_status_check;

ALTER TABLE public.terminal_orders
  ADD CONSTRAINT terminal_orders_integration_setup_status_check
  CHECK (integration_setup_status IN ('not_required', 'pending', 'in_progress', 'completed'));

CREATE INDEX IF NOT EXISTS idx_terminal_orders_integration_setup
  ON public.terminal_orders(integration_setup_status)
  WHERE integration_setup_status IN ('pending', 'in_progress');

-- Backfill fulfillment_type from product where possible
UPDATE public.terminal_orders o
SET fulfillment_type = p.fulfillment_type
FROM public.terminal_products p
WHERE o.product_id = p.id
  AND o.fulfillment_type IS NULL
  AND p.fulfillment_type IS NOT NULL;

-- Notification: integration setup required after purchase
INSERT INTO public.notification_templates (key, title, body, channels, variables, enabled, description)
SELECT key, title, body, channels, variables, true, description
FROM (
  VALUES
    (
      'terminal_integration_setup_required',
      'Complete terminal setup',
      'Hi {{business_name}}, your {{product_name}} order is ready for {{vendor_name}} integration setup. Complete setup: {{setup_url}}',
      ARRAY['push', 'email'],
      ARRAY['business_name', 'product_name', 'order_id', 'vendor_name', 'setup_url', 'app_url'],
      'Sent when a terminal order requires brand integration setup after payment or allocation.'
    ),
    (
      'terminal_order_ready_for_collection',
      'Terminal ready for collection',
      'Hi {{business_name}}, your {{product_name}} is ready for collection at {{collection_location}}.',
      ARRAY['push', 'email'],
      ARRAY['business_name', 'product_name', 'order_id', 'collection_location', 'app_url'],
      'Sent when a collection terminal order is packed and ready for pickup.'
    )
) AS t(key, title, body, channels, variables, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates nt WHERE nt.key = t.key
);
