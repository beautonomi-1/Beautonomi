-- Ensure the free catalog plan is assigned for provider id OR owner user id (upsert: active, no expiry).
-- Lookup ids: requested + provider_id seen on booking limit errors (dedupe by providers.id).

WITH fp AS (
  SELECT COALESCE(
    (SELECT id FROM public.subscription_plans WHERE slug = 'free-tier-default' AND is_active = true LIMIT 1),
    (SELECT id FROM public.subscription_plans WHERE is_free = true AND is_active = true ORDER BY display_order ASC NULLS LAST LIMIT 1)
  ) AS id
),
lookup AS (
  SELECT unnest(ARRAY[
    '11ccc539-9160-47be-b7b3-5fef986f1033'::uuid,
    '0350ad64-f317-4464-9a19-6c39be1f1255'::uuid
  ]) AS lookup_id
),
prov AS (
  SELECT DISTINCT ON (p.id) p.id, p.tenant_id
  FROM public.providers p
  INNER JOIN lookup l ON p.id = l.lookup_id OR p.user_id = l.lookup_id
  ORDER BY p.id
)
INSERT INTO public.provider_subscriptions (
  provider_id,
  plan_id,
  status,
  tenant_id,
  started_at,
  expires_at
)
SELECT
  prov.id,
  fp.id,
  'active',
  prov.tenant_id,
  NOW(),
  NULL
FROM prov
CROSS JOIN fp
WHERE fp.id IS NOT NULL
ON CONFLICT (provider_id) DO UPDATE SET
  plan_id = EXCLUDED.plan_id,
  status = 'active',
  expires_at = NULL,
  tenant_id = COALESCE(EXCLUDED.tenant_id, public.provider_subscriptions.tenant_id),
  updated_at = NOW();
