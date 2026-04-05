-- Host → tenant mapping for public web + /sitemap.xml provider scoping (resolveTenantFromRequest / resolveTenantIdWithZaFallback).
-- Aligns with NEXT_PUBLIC_GLOBAL_ENTRY_HOST (beautonomi.com) and NEXT_PUBLIC_DEFAULT_MARKET_HOST (beautonomi.co.za).
-- 331 already seeds: localhost, 127.0.0.1, beautonomi.com, www.beautonomi.com → tenants.slug = 'za'.

-- Regional ccTLD + www (idempotent).
INSERT INTO public.tenant_domains (tenant_id, hostname, is_primary, is_active)
SELECT t.id, v.hostname, v.is_primary, true
FROM public.tenants t
CROSS JOIN (VALUES
  ('beautonomi.co.za', false),
  ('www.beautonomi.co.za', false)
) AS v(hostname, is_primary)
WHERE t.slug = 'za'
ON CONFLICT (hostname) DO NOTHING;

-- ZA-first: exactly one primary hostname per tenant (used by market-routing primary-domain lookups).
-- Prefer regional ccTLD when that domain row exists and is active; otherwise keep .com as primary.
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
  AND d.is_active = true;

UPDATE public.tenant_domains d
SET is_primary = true
FROM public.tenants t
WHERE d.tenant_id = t.id
  AND t.slug = 'za'
  AND lower(trim(d.hostname)) = 'beautonomi.com'
  AND d.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.tenant_domains d2
    INNER JOIN public.tenants t2 ON t2.id = d2.tenant_id AND t2.slug = 'za'
    WHERE lower(trim(d2.hostname)) = 'beautonomi.co.za' AND d2.is_active = true
  );
