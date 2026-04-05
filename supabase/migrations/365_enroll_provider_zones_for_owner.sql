-- One-off enrollment: provider owned by user 11ccc539-9160-47be-b7b3-5fef986f1033
-- gets provider_zone_selections for every active platform zone. Fixes house-call validation
-- when a finer zone (e.g. city) matches first but only the national seed was auto-enrolled.

INSERT INTO public.provider_zone_selections (
  provider_id,
  platform_zone_id,
  travel_fee,
  currency,
  travel_time_minutes,
  is_active,
  auto_enrolled
)
SELECT
  p.id,
  pz.id,
  NULL,
  'ZAR',
  30,
  true,
  false
FROM public.providers p
CROSS JOIN public.platform_zones pz
WHERE p.user_id = '11ccc539-9160-47be-b7b3-5fef986f1033'::uuid
  AND pz.is_active = true
ON CONFLICT (provider_id, platform_zone_id) DO NOTHING;
