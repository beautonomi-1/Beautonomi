-- Automatically enroll eligible providers into all active platform zones.
--
-- Why:
-- - Existing auto_enroll_providers_for_zone() runs when a zone is published.
-- - New providers could still miss
--   provider_zone_selections and fail house-call validation.
--
-- This migration adds:
-- 1) auto_enroll_provider_for_active_zones(provider_id) helper
-- 2) triggers on providers and platform_zones to invoke the helper
-- 3) one-time backfill call for currently eligible providers

CREATE OR REPLACE FUNCTION auto_enroll_provider_for_active_zones(p_provider_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_offers_mobile BOOLEAN := FALSE;
  v_inserted_count INT := 0;
BEGIN
  IF p_provider_id IS NULL THEN
    RETURN jsonb_build_object('enrolled', 0, 'reason', 'missing_provider_id');
  END IF;

  SELECT
    p.status,
    COALESCE(p.offers_mobile_services, FALSE)
  INTO
    v_status,
    v_offers_mobile
  FROM providers p
  WHERE p.id = p_provider_id;

  IF NOT FOUND OR v_status IS DISTINCT FROM 'active' OR v_offers_mobile IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('enrolled', 0, 'reason', 'provider_not_eligible');
  END IF;

  WITH inserted AS (
    INSERT INTO provider_zone_selections (
      provider_id,
      platform_zone_id,
      travel_fee,
      currency,
      travel_time_minutes,
      is_active,
      auto_enrolled
    )
    SELECT
      p_provider_id,
      pz.id,
      NULL,
      'ZAR',
      30,
      TRUE,
      TRUE
    FROM platform_zones pz
    WHERE pz.is_active = TRUE
      AND pz.status = 'active'
    ON CONFLICT (provider_id, platform_zone_id) DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO v_inserted_count FROM inserted;

  RETURN jsonb_build_object('enrolled', v_inserted_count);
END;
$$;

COMMENT ON FUNCTION auto_enroll_provider_for_active_zones IS
  'Auto-enrolls one eligible provider into all active platform zones.';

CREATE OR REPLACE FUNCTION trg_auto_enroll_provider_from_providers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM auto_enroll_provider_for_active_zones(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_enroll_provider_from_providers ON providers;
CREATE TRIGGER trg_auto_enroll_provider_from_providers
AFTER INSERT OR UPDATE OF status, offers_mobile_services
ON providers
FOR EACH ROW
EXECUTE FUNCTION trg_auto_enroll_provider_from_providers();

CREATE OR REPLACE FUNCTION trg_auto_enroll_all_providers_for_zone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider_id UUID;
BEGIN
  IF NEW.is_active IS DISTINCT FROM TRUE OR NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;

  FOR v_provider_id IN
    SELECT p.id
    FROM providers p
    WHERE p.status = 'active'
      AND COALESCE(p.offers_mobile_services, FALSE) = TRUE
  LOOP
    PERFORM auto_enroll_provider_for_active_zones(v_provider_id);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_enroll_all_providers_for_zone ON platform_zones;
CREATE TRIGGER trg_auto_enroll_all_providers_for_zone
AFTER INSERT OR UPDATE OF is_active, status
ON platform_zones
FOR EACH ROW
EXECUTE FUNCTION trg_auto_enroll_all_providers_for_zone();

DO $$
DECLARE
  v_provider_id UUID;
BEGIN
  FOR v_provider_id IN
    SELECT p.id
    FROM providers p
    WHERE p.status = 'active'
      AND COALESCE(p.offers_mobile_services, FALSE) = TRUE
  LOOP
    PERFORM auto_enroll_provider_for_active_zones(v_provider_id);
  END LOOP;
END;
$$;
