-- Tenant scope for promotions (spec §5.2 / admin marketing).

ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

UPDATE public.promotions p
SET tenant_id = t.id
FROM public.tenants t
WHERE p.tenant_id IS NULL AND t.slug = 'za';

ALTER TABLE public.promotions
  ALTER COLUMN tenant_id SET NOT NULL;

DROP INDEX IF EXISTS idx_promotions_code_provider;

CREATE UNIQUE INDEX IF NOT EXISTS idx_promotions_tenant_code_provider
  ON public.promotions (tenant_id, code, COALESCE(provider_id::text, '00000000-0000-0000-0000-000000000000'));

CREATE INDEX IF NOT EXISTS idx_promotions_tenant_id ON public.promotions (tenant_id);
