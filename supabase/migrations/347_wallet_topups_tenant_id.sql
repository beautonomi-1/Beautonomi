-- Attribute wallet top-ups to a market for admin finance summary (Host-aligned writes + backfill).

ALTER TABLE public.wallet_topups
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants (id);

CREATE INDEX IF NOT EXISTS idx_wallet_topups_tenant_id ON public.wallet_topups (tenant_id);

CREATE INDEX IF NOT EXISTS idx_wallet_topups_tenant_paid
  ON public.wallet_topups (tenant_id, paid_at DESC)
  WHERE status = 'paid';

UPDATE public.wallet_topups w
SET tenant_id = u.preferred_home_tenant_id
FROM public.users u
WHERE u.id = w.user_id
  AND w.tenant_id IS NULL
  AND u.preferred_home_tenant_id IS NOT NULL;

UPDATE public.wallet_topups w
SET tenant_id = t.id
FROM public.tenants t
WHERE w.tenant_id IS NULL
  AND t.slug = 'za';
