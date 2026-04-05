-- OneSignal: separate REST API keys for customer vs provider mobile apps (superadmin → platform_secrets).
-- Existing onesignal_rest_api_key = customer app; new column = provider app.

ALTER TABLE public.platform_secrets
  ADD COLUMN IF NOT EXISTS onesignal_rest_api_key_provider TEXT;

COMMENT ON COLUMN public.platform_secrets.onesignal_rest_api_key IS
  'OneSignal REST API key for the customer mobile app (v5 os_v2_app_…).';

COMMENT ON COLUMN public.platform_secrets.onesignal_rest_api_key_provider IS
  'OneSignal REST API key for the provider/partner mobile app.';

-- Tenant-scoped secrets (same shape for future per-tenant push).
ALTER TABLE public.tenant_secrets
  ADD COLUMN IF NOT EXISTS onesignal_rest_api_key_provider TEXT;
