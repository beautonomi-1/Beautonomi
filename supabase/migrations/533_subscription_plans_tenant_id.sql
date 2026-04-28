-- Align subscription_plans with admin API and pricing_plans scoping (global default + optional tenant row).
-- Application code reads/writes tenant_id for create + merge; DB previously had no column in some environments.

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_plans_tenant_id ON public.subscription_plans (tenant_id);

COMMENT ON COLUMN public.subscription_plans.tenant_id IS
  'NULL = global catalog row; set for a tenant-specific override of the same logical plan (merged in admin by name).';
