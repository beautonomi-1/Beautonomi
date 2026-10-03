-- Preview / staging hostnames for Vercel Preview (TENANT_DOMAIN_ENV=preview).
-- Safe on production DB: rows are scoped by environment column.

INSERT INTO public.tenant_domains (tenant_id, hostname, is_primary, is_active, environment)
SELECT t.id, v.hostname, v.is_primary, true, 'preview'
FROM public.tenants t
CROSS JOIN (VALUES
  ('staging.beautonomi.com', false),
  ('staging.beautonomi.co.za', false)
) AS v(hostname, is_primary)
WHERE t.slug = 'za'
ON CONFLICT ((lower(hostname)), environment) DO UPDATE
SET tenant_id = EXCLUDED.tenant_id,
    is_active = true,
    is_primary = EXCLUDED.is_primary;
