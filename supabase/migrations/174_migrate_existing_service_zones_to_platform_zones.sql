-- Migration: Migrate existing service_zones to platform_zones
-- This migration helps transition from the old single-tier system to the new two-tier system
-- NOTE: Old service_zones table (from migration 003) only supports 'radius' and 'polygon' zone types
-- This migration only migrates those zone types. postal_code and city zones are not migrated.

-- Step 1: Create platform zones from existing service zones
-- Only migrate radius and polygon zones (the only types that exist in old table structure)
INSERT INTO platform_zones (
  name,
  zone_type,
  postal_codes,
  cities,
  polygon_coordinates,
  center_latitude,
  center_longitude,
  radius_km,
  description,
  is_active,
  created_by
)
SELECT DISTINCT ON (
  COALESCE(zone_type::text, ''),
  COALESCE(center_latitude::text, ''),
  COALESCE(center_longitude::text, ''),
  COALESCE(radius_km::text, ''),
  COALESCE(polygon_coordinates::text, '')
)
  -- Create unique name from zone definition
  CASE 
    WHEN zone_type = 'radius' AND radius_km IS NOT NULL THEN 
      'Platform Zone: ' || radius_km::text || 'km radius from (' || 
      center_latitude::text || ', ' || center_longitude::text || ')'
    WHEN zone_type = 'polygon' AND polygon_coordinates IS NOT NULL THEN 
      'Platform Zone: Polygon ' || COALESCE(name, 'Zone')
    WHEN zone_type = 'radius' THEN 
      'Platform Zone: Radius'
    WHEN zone_type = 'polygon' THEN 
      'Platform Zone: Polygon'
    ELSE 'Platform Zone: ' || COALESCE(zone_type::text, 'Unknown')
  END AS name,
  zone_type,
  -- postal_codes and cities don't exist in old table, set to NULL
  NULL AS postal_codes,
  NULL AS cities,
  -- Only set polygon_coordinates for polygon zones
  CASE WHEN zone_type = 'polygon' THEN polygon_coordinates ELSE NULL END AS polygon_coordinates,
  -- Only set center/radius for radius zones
  CASE WHEN zone_type = 'radius' THEN center_latitude ELSE NULL END AS center_latitude,
  CASE WHEN zone_type = 'radius' THEN center_longitude ELSE NULL END AS center_longitude,
  CASE WHEN zone_type = 'radius' THEN radius_km ELSE NULL END AS radius_km,
  'Migrated from service_zones' AS description,
  true AS is_active,
  -- Use first superadmin user as creator, or NULL if none exists
  (SELECT id FROM users WHERE role = 'superadmin' LIMIT 1) AS created_by
FROM service_zones
WHERE COALESCE(is_active, true) = true
  -- Only migrate radius and polygon zones (the only types in old table)
  AND zone_type IN ('radius', 'polygon')
  -- Only migrate zones that have valid data for their type
  AND (
    (zone_type = 'radius' AND center_latitude IS NOT NULL AND center_longitude IS NOT NULL AND radius_km IS NOT NULL) OR
    (zone_type = 'polygon' AND polygon_coordinates IS NOT NULL)
  )
ORDER BY 
  COALESCE(zone_type::text, ''),
  COALESCE(center_latitude::text, ''),
  COALESCE(center_longitude::text, ''),
  COALESCE(radius_km::text, ''),
  COALESCE(polygon_coordinates::text, ''),
  created_at;

-- Step 2: Create provider zone selections from existing service zones
-- Match service zones to platform zones and create selections with provider pricing
-- Only matches radius and polygon zones (the only types in old table structure)
-- NOTE: Old service_zones table (from migration 003) doesn't have:
--   - travel_fee (default: 0)
--   - currency (default: 'ZAR')
--   - travel_time_minutes (default: 30)
--   - description (default: NULL or use name)

DO $$
DECLARE
  has_travel_fee BOOLEAN;
  has_currency BOOLEAN;
  has_travel_time BOOLEAN;
  has_description BOOLEAN;
BEGIN
  -- Check if columns exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'service_zones' AND column_name = 'travel_fee'
  ) INTO has_travel_fee;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'service_zones' AND column_name = 'currency'
  ) INTO has_currency;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'service_zones' AND column_name = 'travel_time_minutes'
  ) INTO has_travel_time;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'service_zones' AND column_name = 'description'
  ) INTO has_description;

  -- Build and execute dynamic SQL based on column existence
  EXECUTE format('
    INSERT INTO provider_zone_selections (
      provider_id,
      platform_zone_id,
      travel_fee,
      currency,
      travel_time_minutes,
      description,
      is_active
    )
    SELECT DISTINCT ON (sz.provider_id, pz.id)
      sz.provider_id,
      pz.id AS platform_zone_id,
      %s AS travel_fee,
      %s AS currency,
      %s AS travel_time_minutes,
      %s AS description,
      COALESCE(sz.is_active, true) AS is_active
    FROM service_zones sz
    INNER JOIN platform_zones pz ON (
      sz.zone_type = pz.zone_type 
      AND sz.zone_type IN (''radius'', ''polygon'')
      AND (
        (sz.zone_type = ''radius'' AND 
         sz.center_latitude = pz.center_latitude AND 
         sz.center_longitude = pz.center_longitude AND 
         sz.radius_km = pz.radius_km) OR
        (sz.zone_type = ''polygon'' AND sz.polygon_coordinates = pz.polygon_coordinates)
      )
    )
    WHERE COALESCE(sz.is_active, true) = true
    ORDER BY sz.provider_id, pz.id, sz.created_at',
    -- Use column value if exists, otherwise default
    CASE WHEN has_travel_fee THEN 'COALESCE(sz.travel_fee, 0)' ELSE '0' END,
    CASE WHEN has_currency THEN 'COALESCE(sz.currency, ''ZAR'')' ELSE '''ZAR''' END,
    CASE WHEN has_travel_time THEN 'COALESCE(sz.travel_time_minutes, 30)' ELSE '30' END,
    -- Use description if exists, otherwise use name or NULL
    CASE 
      WHEN has_description THEN 'sz.description'
      ELSE 'COALESCE(sz.name, NULL)'
    END
  );
END $$;

-- Step 3: Add comment explaining the migration
COMMENT ON TABLE platform_zones IS 'Platform-wide service zones. Migrated from service_zones table. Providers now select from these zones instead of creating their own.';
COMMENT ON TABLE provider_zone_selections IS 'Provider selections of platform zones with custom pricing. Migrated from service_zones table.';

-- Note: The old service_zones table is kept for backward compatibility during transition
-- It can be dropped after confirming all providers have migrated to the new system
