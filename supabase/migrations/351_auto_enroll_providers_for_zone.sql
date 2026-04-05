-- Migration: Auto-enroll providers when a platform zone goes active
--
-- Changes:
--   1. Make provider_zone_selections.travel_fee nullable so auto-enrolled
--      providers use the rate engine instead of a forced R0 flat fee.
--   2. Add auto_enrolled flag to distinguish platform-seeded vs provider-opted rows.
--   3. Grant superadmin write access to provider_zone_selections (needed for
--      admin UI management; the RPC itself uses SECURITY DEFINER).
--   4. Create auto_enroll_providers_for_zone() SECURITY DEFINER RPC called by
--      the publish route after a zone transitions to 'active'.

-- 1) travel_fee nullable  (NULL = use rate engine; a number = provider flat override)
ALTER TABLE provider_zone_selections
  ALTER COLUMN travel_fee DROP NOT NULL;

-- 2) Track platform-seeded rows so providers can tell them apart from manual opt-ins
ALTER TABLE provider_zone_selections
  ADD COLUMN IF NOT EXISTS auto_enrolled BOOLEAN NOT NULL DEFAULT FALSE;

-- 3) Superadmin write access (the publish route reads via SECURITY DEFINER so
--    this policy is mainly for future admin UI management endpoints)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'provider_zone_selections'
      AND policyname = 'Superadmins can manage provider_zone_selections'
  ) THEN
    CREATE POLICY "Superadmins can manage provider_zone_selections"
      ON provider_zone_selections
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM users
          WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
      );
  END IF;
END $$;

-- 4) auto_enroll_providers_for_zone
--    Called after a zone transitions to 'active'.
--    Finds every active, mobile-capable provider whose primary location
--    sits inside the zone's PostGIS geometry and creates a
--    provider_zone_selections row for them.
--
--    travel_fee is intentionally NULL so the rate engine kicks in — providers
--    can set a flat override at any time from their zone settings panel.
--
--    Idempotent: ON CONFLICT DO NOTHING skips providers already enrolled.
--
--    Returns JSONB: { enrolled: int, skipped: int }

CREATE OR REPLACE FUNCTION auto_enroll_providers_for_zone(p_zone_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_geometry  geography;
  v_enrolled  INT := 0;
  v_already   INT := 0;
BEGIN
  -- Zone must be active and have computed geometry
  SELECT geometry
  INTO   v_geometry
  FROM   platform_zones
  WHERE  id      = p_zone_id
    AND  status  = 'active'
    AND  geometry IS NOT NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'enrolled', 0,
      'skipped',  0,
      'error',    'Zone not active or geometry not yet computed'
    );
  END IF;

  -- Count providers that already have a selection for this zone (skipped)
  SELECT COUNT(*)
  INTO   v_already
  FROM   provider_zone_selections
  WHERE  platform_zone_id = p_zone_id;

  -- Insert provider_zone_selections for qualifying providers
  --   Qualifying:
  --     • provider is active and offers mobile services
  --     • provider has an active primary location with coordinates
  --     • primary location point is inside the zone geometry
  WITH qualifying AS (
    SELECT DISTINCT pl.provider_id
    FROM   provider_locations pl
    JOIN   providers p ON p.id = pl.provider_id
    WHERE  pl.is_primary          = true
      AND  pl.is_active           = true
      AND  p.is_active            = true
      AND  p.offers_mobile_services = true
      AND  pl.latitude            IS NOT NULL
      AND  pl.longitude           IS NOT NULL
      AND  ST_Contains(
             v_geometry::geometry,
             ST_SetSRID(
               ST_MakePoint(pl.longitude::float8, pl.latitude::float8),
               4326
             )
           )
  ),
  inserted AS (
    INSERT INTO provider_zone_selections
      (provider_id, platform_zone_id, travel_fee, currency,
       travel_time_minutes, is_active, auto_enrolled)
    SELECT
      q.provider_id,
      p_zone_id,
      NULL,   -- use rate engine; provider sets flat fee in their settings
      'ZAR',
      30,
      true,
      true
    FROM qualifying q
    ON CONFLICT (provider_id, platform_zone_id) DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO v_enrolled FROM inserted;

  RETURN jsonb_build_object(
    'enrolled', v_enrolled,
    'skipped',  v_already
  );
END;
$$;

COMMENT ON FUNCTION auto_enroll_providers_for_zone IS
  'Called when a platform zone is published (status → active). '
  'Auto-creates provider_zone_selections for every active, mobile-capable provider '
  'whose primary location falls inside the zone geometry. travel_fee is NULL so the '
  'distance-based rate engine is used until the provider sets a flat fee. '
  'Idempotent via ON CONFLICT DO NOTHING. Returns { enrolled, skipped }.';
