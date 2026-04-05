-- Scope user_reports to a market for tenant admin lists and nav badges (NN-1 / admin boundary).

ALTER TABLE public.user_reports
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

CREATE INDEX IF NOT EXISTS idx_user_reports_tenant_id ON public.user_reports (tenant_id);

CREATE INDEX IF NOT EXISTS idx_user_reports_tenant_status_pending
  ON public.user_reports (tenant_id, status)
  WHERE status = 'pending';

-- From linked booking
UPDATE public.user_reports ur
SET tenant_id = b.tenant_id
FROM public.bookings b
WHERE ur.booking_id = b.id
  AND ur.tenant_id IS NULL
  AND b.tenant_id IS NOT NULL;

-- Customer reported provider (no booking): reported_user_id is providers.user_id
UPDATE public.user_reports ur
SET tenant_id = p.tenant_id
FROM public.providers p
WHERE ur.booking_id IS NULL
  AND ur.report_type = 'customer_reported_provider'
  AND p.user_id = ur.reported_user_id
  AND ur.tenant_id IS NULL
  AND p.tenant_id IS NOT NULL;

-- Provider reported customer (no booking): reporter is provider user
UPDATE public.user_reports ur
SET tenant_id = p.tenant_id
FROM public.providers p
WHERE ur.booking_id IS NULL
  AND ur.report_type = 'provider_reported_customer'
  AND p.user_id = ur.reporter_id
  AND ur.tenant_id IS NULL
  AND p.tenant_id IS NOT NULL;

-- Legacy fallback market
UPDATE public.user_reports ur
SET tenant_id = t.id
FROM public.tenants t
WHERE ur.tenant_id IS NULL
  AND t.slug = 'za';
