-- Scope identity verification queue to market for tenant admin lists, activity, and nav badges.

ALTER TABLE public.user_verifications
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants (id);

CREATE INDEX IF NOT EXISTS idx_user_verifications_tenant_id ON public.user_verifications (tenant_id);

CREATE INDEX IF NOT EXISTS idx_user_verifications_tenant_pending
  ON public.user_verifications (tenant_id, status)
  WHERE status = 'pending';

-- Submitting user is a provider: one provider row per user (user_id UNIQUE on providers).
UPDATE public.user_verifications uv
SET tenant_id = p.tenant_id
FROM public.providers p
WHERE p.user_id = uv.user_id
  AND uv.tenant_id IS NULL
  AND p.tenant_id IS NOT NULL;

-- Customers / staff without provider row
UPDATE public.user_verifications uv
SET tenant_id = u.preferred_home_tenant_id
FROM public.users u
WHERE u.id = uv.user_id
  AND uv.tenant_id IS NULL
  AND u.preferred_home_tenant_id IS NOT NULL;

UPDATE public.user_verifications uv
SET tenant_id = t.id
FROM public.tenants t
WHERE uv.tenant_id IS NULL
  AND t.slug = 'za';
