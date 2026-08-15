-- Superadmin-managed ecommerce courier booking (gate + live keys).
-- Default stays OFF. Env ECOMMERCE_SHIPPING_ENABLED=false remains an emergency kill switch.

ALTER TABLE public.platform_secrets
  ADD COLUMN IF NOT EXISTS ecommerce_shipping_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS courier_guy_api_key TEXT,
  ADD COLUMN IF NOT EXISTS courier_guy_base_url TEXT,
  ADD COLUMN IF NOT EXISTS bob_go_api_key TEXT,
  ADD COLUMN IF NOT EXISTS bob_go_base_url TEXT,
  ADD COLUMN IF NOT EXISTS aramex_account_number TEXT,
  ADD COLUMN IF NOT EXISTS aramex_account_pin TEXT,
  ADD COLUMN IF NOT EXISTS aramex_username TEXT,
  ADD COLUMN IF NOT EXISTS aramex_password TEXT,
  ADD COLUMN IF NOT EXISTS aramex_account_entity TEXT,
  ADD COLUMN IF NOT EXISTS aramex_account_country_code TEXT,
  ADD COLUMN IF NOT EXISTS aramex_source TEXT,
  ADD COLUMN IF NOT EXISTS aramex_base_url TEXT;

COMMENT ON COLUMN public.platform_secrets.ecommerce_shipping_enabled IS
  'When true, paid delivery product orders may book Courier Guy / Bob Go / Aramex. Superadmin Integrations → Courier shipping. Env ECOMMERCE_SHIPPING_ENABLED=false forces off.';
COMMENT ON COLUMN public.platform_secrets.courier_guy_api_key IS
  'ShipLogic / Courier Guy merchant API token. Env COURIER_GUY_API_KEY overrides.';
COMMENT ON COLUMN public.platform_secrets.bob_go_api_key IS
  'Bob Go v2 Bearer token. Env BOB_GO_API_KEY overrides.';
COMMENT ON COLUMN public.platform_secrets.aramex_password IS
  'Aramex Shipping API password. Env ARAMEX_* overrides.';
