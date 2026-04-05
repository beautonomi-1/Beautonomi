-- Core multi-tenant tables (spec §6.1). RLS enabled; service role bypasses for API routes.

CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  region_code TEXT NOT NULL,
  lifecycle TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle IN ('active', 'sandbox', 'suspended', 'disabled')),
  default_currency TEXT NOT NULL,
  default_language TEXT NOT NULL DEFAULT 'en',
  default_timezone TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants (slug) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tenants_lifecycle ON public.tenants (lifecycle);

CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.tenant_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL UNIQUE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_domains_one_primary_per_tenant
  ON public.tenant_domains (tenant_id)
  WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS idx_tenant_domains_tenant_id ON public.tenant_domains (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_domains_hostname_active ON public.tenant_domains (lower(hostname)) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.tenant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

CREATE TRIGGER update_tenant_settings_updated_at
  BEFORE UPDATE ON public.tenant_settings FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- One row per tenant for encrypted-at-rest secrets (server-only reads via service role).
CREATE TABLE IF NOT EXISTS public.tenant_secrets (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  paystack_secret_key TEXT,
  paystack_webhook_secret TEXT,
  stripe_secret_key TEXT,
  stripe_webhook_secret TEXT,
  yoco_webhook_secret TEXT,
  mapbox_access_token TEXT,
  onesignal_rest_api_key TEXT,
  amplitude_secret_key TEXT,
  google_calendar_client_secret TEXT,
  outlook_client_secret TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_tenant_secrets_updated_at
  BEFORE UPDATE ON public.tenant_secrets FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.user_tenant_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_tenant_roles_user_id ON public.user_tenant_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_user_tenant_roles_tenant_id ON public.user_tenant_roles (tenant_id);

CREATE TABLE IF NOT EXISTS public.tenant_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_audit_log_tenant_created ON public.tenant_audit_log (tenant_id, created_at DESC);

-- RLS: block direct client access; Next.js service role bypasses RLS.
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_tenant_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_audit_log ENABLE ROW LEVEL SECURITY;

-- Seed default market tenant (legacy backfill anchor; NN-8 — do not use as silent fallback in app after cutover).
INSERT INTO public.tenants (
  slug, name, region_code, lifecycle, default_currency, default_language, default_timezone, is_active
)
VALUES (
  'za',
  'South Africa',
  'ZA',
  'active',
  'ZAR',
  'en',
  'Africa/Johannesburg',
  true
)
ON CONFLICT (slug) DO NOTHING;

-- Link common hostnames to default tenant (extend via admin / migrations per market).
INSERT INTO public.tenant_domains (tenant_id, hostname, is_primary, is_active)
SELECT t.id, v.hostname, v.is_primary, true
FROM public.tenants t
CROSS JOIN (VALUES
  ('localhost', false),
  ('127.0.0.1', false),
  ('beautonomi.com', true),
  ('www.beautonomi.com', false)
) AS v(hostname, is_primary)
WHERE t.slug = 'za'
ON CONFLICT (hostname) DO NOTHING;

INSERT INTO public.tenant_settings (tenant_id, settings, version, is_active)
SELECT id, '{}'::jsonb, 1, true
FROM public.tenants
WHERE slug = 'za'
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO public.tenant_secrets (tenant_id)
SELECT id FROM public.tenants WHERE slug = 'za'
ON CONFLICT (tenant_id) DO NOTHING;
