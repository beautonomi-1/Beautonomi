-- Seed a broad South Africa platform zone so house-call validation can match in-country
-- addresses when finer postal/city/polygon zones do not apply. The web /api/location/validate
-- matcher uses legacy radius fields (center + radius_km), not PostGIS geometry.
--
-- Also enrolls active mobile-capable providers (ZA tenant or legacy NULL tenant_id) so the
-- provider_zone_selections gate passes after a zone match.

DO $$
DECLARE
  v_zone_id CONSTANT uuid := '36400000-0000-4000-8000-000000000001'::uuid;
  v_za_tenant_id uuid;
BEGIN
  SELECT id INTO v_za_tenant_id FROM public.tenants WHERE slug = 'za' LIMIT 1;

  INSERT INTO public.platform_zones (
    id,
    name,
    zone_type,
    center_latitude,
    center_longitude,
    radius_km,
    description,
    is_active,
    status,
    country_code
  )
  SELECT
    v_zone_id,
    'South Africa (national coverage — seed)',
    'radius',
    -28.9962,
    24.9917,
    2000,
    'Migration 364: large radius from SA centroid so addresses inside South Africa match the platform zone matcher used by /api/location/validate.',
    true,
    'active',
    'ZA'
  WHERE NOT EXISTS (SELECT 1 FROM public.platform_zones WHERE id = v_zone_id);

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
    v_zone_id,
    NULL,
    'ZAR',
    30,
    true,
    true
  FROM public.providers p
  WHERE p.status = 'active'
    AND p.offers_mobile_services = true
    AND (
      p.tenant_id IS NULL
      OR (v_za_tenant_id IS NOT NULL AND p.tenant_id = v_za_tenant_id)
    )
  ON CONFLICT (provider_id, platform_zone_id) DO NOTHING;
END;
$$;
