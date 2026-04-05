-- Wave 1: nullable tenant_id on core commercial tables + backfill to default tenant (spec §6.2).

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

UPDATE public.providers p
SET tenant_id = t.id
FROM public.tenants t
WHERE p.tenant_id IS NULL AND t.slug = 'za';

UPDATE public.bookings b
SET tenant_id = t.id
FROM public.tenants t
WHERE b.tenant_id IS NULL AND t.slug = 'za';

CREATE INDEX IF NOT EXISTS idx_providers_tenant_id ON public.providers (tenant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant_id ON public.bookings (tenant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant_scheduled ON public.bookings (tenant_id, scheduled_at DESC);
