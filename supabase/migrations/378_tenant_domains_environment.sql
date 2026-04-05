-- Environment-scoped host → tenant mapping (GLOBAL_EXPANSION_GUIDE / spec §7.1).
-- Allows the same hostname to map to different tenants per deploy environment (e.g. Vercel preview)
-- without colliding with production rows.

ALTER TABLE public.tenant_domains
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'production';

ALTER TABLE public.tenant_domains
  ADD COLUMN IF NOT EXISTS is_legacy BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenant_domains.environment IS 'Deploy environment: production | preview | development | staging. Resolver matches TENANT_DOMAIN_ENV / VERCEL_ENV.';
COMMENT ON COLUMN public.tenant_domains.is_legacy IS 'True if hostname is deprecated but still routed for redirects/SEO.';

-- Replace single-column hostname uniqueness with (hostname, environment).
ALTER TABLE public.tenant_domains DROP CONSTRAINT IF EXISTS tenant_domains_hostname_key;

DROP INDEX IF EXISTS tenant_domains_hostname_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_domains_hostname_environment_uidx
  ON public.tenant_domains (lower(hostname), environment);
