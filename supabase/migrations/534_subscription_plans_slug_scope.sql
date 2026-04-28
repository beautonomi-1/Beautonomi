-- Allow the same slug for a tenant override as long as it is unique per (tenant_id, slug);
-- global rows (tenant_id IS NULL) stay unique on slug alone.

ALTER TABLE public.subscription_plans
  DROP CONSTRAINT IF EXISTS subscription_plans_slug_key;
ALTER TABLE public.subscription_plans
  DROP CONSTRAINT IF EXISTS subscription_plans_slug_unique;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_subscription_plans_global_slug
  ON public.subscription_plans (slug)
  WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_subscription_plans_tenant_slug
  ON public.subscription_plans (tenant_id, slug)
  WHERE tenant_id IS NOT NULL;
