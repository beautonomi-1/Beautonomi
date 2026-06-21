-- Per-provider override for platform marketing credentials (nullable = use plan default).
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS marketing_use_platform_credentials boolean DEFAULT NULL;

COMMENT ON COLUMN public.providers.marketing_use_platform_credentials IS
  'When set, overrides subscription plan marketing_campaigns.use_platform_credentials for this provider.';
