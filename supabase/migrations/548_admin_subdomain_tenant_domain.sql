-- Map the production admin hostname so strict Host -> tenant resolution does not
-- reject admin-origin requests before admin route/API authorization runs.
-- This row is not primary and must not be used as a public marketplace domain.

INSERT INTO public.tenant_domains (
  tenant_id,
  hostname,
  is_primary,
  is_active,
  environment,
  is_legacy
)
SELECT
  t.id,
  'admin.beautonomi.com',
  false,
  true,
  'production',
  false
FROM public.tenants t
WHERE t.slug = 'za'
  AND NOT EXISTS (
    SELECT 1
    FROM public.tenant_domains d
    WHERE lower(trim(d.hostname)) = 'admin.beautonomi.com'
      AND d.environment = 'production'
  );
