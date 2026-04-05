-- Optional home / preferred tenant hint for customer UX only (spec §6.2.1, Cross-Border Principles).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS preferred_home_tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_preferred_home_tenant
  ON public.users (preferred_home_tenant_id)
  WHERE preferred_home_tenant_id IS NOT NULL;
