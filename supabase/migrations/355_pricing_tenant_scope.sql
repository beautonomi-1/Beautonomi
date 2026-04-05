-- 355_pricing_tenant_scope.sql
-- Additive tenant scoping for pricing content (global default + tenant override).

ALTER TABLE public.pricing_plans
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE public.pricing_faqs
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_pricing_plans_tenant_id ON public.pricing_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pricing_faqs_tenant_id ON public.pricing_faqs(tenant_id);

-- Optional uniqueness for plan names by scope to support override merge by name.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pricing_plans_global_name
  ON public.pricing_plans(name)
  WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pricing_plans_tenant_name
  ON public.pricing_plans(tenant_id, name)
  WHERE tenant_id IS NOT NULL;
