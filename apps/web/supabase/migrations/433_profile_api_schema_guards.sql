-- Columns referenced by GET /api/provider/profile and related provider APIs.
-- Safe on DBs that applied root supabase migrations only, apps/web only, or a mix.

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

ALTER TABLE public.provider_locations
  ADD COLUMN IF NOT EXISTS location_type TEXT DEFAULT 'salon';

UPDATE public.providers p
SET tenant_id = t.id
FROM public.tenants t
WHERE p.tenant_id IS NULL AND t.slug = 'za';

CREATE INDEX IF NOT EXISTS idx_providers_tenant_id ON public.providers (tenant_id);
