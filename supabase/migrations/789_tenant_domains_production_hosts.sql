-- Ensure all production market hosts map to the ZA tenant with environment=production.
-- Required before STRICT_TENANT_HOST_RESOLUTION=true in production.

INSERT INTO public.tenant_domains (tenant_id, hostname, is_primary, is_active, environment)
SELECT t.id, v.hostname, v.is_primary, true, 'production'
FROM public.tenants t
CROSS JOIN (VALUES
  ('localhost', false),
  ('127.0.0.1', false),
  ('beautonomi.com', false),
  ('www.beautonomi.com', false),
  ('beautonomi.co.za', true),
  ('www.beautonomi.co.za', false),
  ('provider.beautonomi.co.za', false),
  ('admin.beautonomi.co.za', false)
) AS v(hostname, is_primary)
WHERE t.slug = 'za'
  AND NOT EXISTS (
    SELECT 1
    FROM public.tenant_domains d
    WHERE lower(trim(d.hostname)) = lower(trim(v.hostname))
      AND d.environment = 'production'
  );

UPDATE public.tenant_domains d
SET tenant_id = t.id, is_active = true
FROM public.tenants t
CROSS JOIN (VALUES
  ('localhost'),
  ('127.0.0.1'),
  ('beautonomi.com'),
  ('www.beautonomi.com'),
  ('beautonomi.co.za'),
  ('www.beautonomi.co.za'),
  ('provider.beautonomi.co.za'),
  ('admin.beautonomi.co.za')
) AS v(hostname)
WHERE t.slug = 'za'
  AND lower(trim(d.hostname)) = lower(trim(v.hostname))
  AND d.environment = 'production';

-- Single primary per tenant (prefer regional ccTLD).
UPDATE public.tenant_domains d
SET is_primary = false
FROM public.tenants t
WHERE d.tenant_id = t.id AND t.slug = 'za';

UPDATE public.tenant_domains d
SET is_primary = true
FROM public.tenants t
WHERE d.tenant_id = t.id
  AND t.slug = 'za'
  AND lower(trim(d.hostname)) = 'beautonomi.co.za'
  AND d.environment = 'production'
  AND d.is_active = true;

UPDATE public.tenant_domains d
SET is_primary = true
FROM public.tenants t
WHERE d.tenant_id = t.id
  AND t.slug = 'za'
  AND lower(trim(d.hostname)) = 'beautonomi.com'
  AND d.environment = 'production'
  AND d.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.tenant_domains d2
    INNER JOIN public.tenants t2 ON t2.id = d2.tenant_id AND t2.slug = 'za'
    WHERE lower(trim(d2.hostname)) = 'beautonomi.co.za'
      AND d2.environment = 'production'
      AND d2.is_active = true
  );
