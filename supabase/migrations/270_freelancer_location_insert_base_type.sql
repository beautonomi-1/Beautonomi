-- When ensure_freelancer_location creates a new provider_locations row, set location_type = 'base'
-- so the provider is treated as mobile-only (no at_salon) until they add a physical salon.

CREATE OR REPLACE FUNCTION ensure_freelancer_location(p_provider_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_provider_name TEXT;
  v_location_exists BOOLEAN;
  v_service_zone_exists BOOLEAN;
  v_location_id UUID;
  v_lat NUMERIC;
  v_lng NUMERIC;
  v_result JSONB;
  v_addr_line1 TEXT;
  v_addr_line2 TEXT;
  v_addr_city TEXT;
  v_addr_state TEXT;
  v_addr_country TEXT;
  v_addr_postal_code TEXT;
  v_addr_lat NUMERIC;
  v_addr_lng NUMERIC;
  v_has_address BOOLEAN := false;
BEGIN
  SELECT p.user_id, p.business_name INTO v_user_id, v_provider_name
  FROM providers p
  WHERE p.id = p_provider_id AND p.business_type = 'freelancer';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Provider not found or not a freelancer';
  END IF;

  SELECT ua.address_line1, ua.address_line2, ua.city, ua.state, ua.country, ua.postal_code, ua.latitude, ua.longitude
  INTO v_addr_line1, v_addr_line2, v_addr_city, v_addr_state, v_addr_country, v_addr_postal_code, v_addr_lat, v_addr_lng
  FROM user_addresses ua
  WHERE ua.user_id = v_user_id
  ORDER BY ua.is_default DESC NULLS LAST, ua.created_at ASC
  LIMIT 1;

  v_has_address := (v_addr_line1 IS NOT NULL AND v_addr_city IS NOT NULL AND v_addr_country IS NOT NULL);

  SELECT EXISTS(SELECT 1 FROM provider_locations WHERE provider_id = p_provider_id AND is_active = true) INTO v_location_exists;
  SELECT EXISTS(SELECT 1 FROM service_zones WHERE provider_id = p_provider_id AND is_active = true) INTO v_service_zone_exists;

  IF NOT v_location_exists AND v_has_address THEN
    INSERT INTO provider_locations (
      provider_id, name, address_line1, address_line2, city, state, country, postal_code,
      latitude, longitude, is_active, is_primary, working_hours, location_type, created_at, updated_at
    )
    VALUES (
      p_provider_id,
      COALESCE(v_provider_name, 'Home Location'),
      v_addr_line1, v_addr_line2, v_addr_city, v_addr_state, v_addr_country, v_addr_postal_code,
      v_addr_lat, v_addr_lng,
      true, true,
      '{"monday":{"open":"09:00","close":"18:00","closed":false},"tuesday":{"open":"09:00","close":"18:00","closed":false},"wednesday":{"open":"09:00","close":"18:00","closed":false},"thursday":{"open":"09:00","close":"18:00","closed":false},"friday":{"open":"09:00","close":"18:00","closed":false},"saturday":{"open":"09:00","close":"13:00","closed":false},"sunday":{"open":"09:00","close":"18:00","closed":true}}'::jsonb,
      'base',
      NOW(), NOW()
    )
    RETURNING id INTO v_location_id;

    v_result := jsonb_build_object(
      'success', true, 'location_created', true, 'location_id', v_location_id,
      'from_user_address', true, 'has_coordinates', (v_addr_lat IS NOT NULL AND v_addr_lng IS NOT NULL)
    );
  ELSIF v_location_exists THEN
    SELECT id INTO v_location_id FROM provider_locations WHERE provider_id = p_provider_id AND is_active = true LIMIT 1;
    v_result := jsonb_build_object('success', true, 'location_created', false, 'location_exists', true, 'location_id', v_location_id);
  ELSE
    v_result := jsonb_build_object(
      'success', false, 'location_created', false, 'location_exists', false,
      'warning', 'No location found and no user address available. Please add a saved address (Profile/Addresses) or add a location in provider settings.'
    );
  END IF;

  IF NOT v_service_zone_exists AND v_location_id IS NOT NULL THEN
    BEGIN
      SELECT latitude, longitude INTO v_lat, v_lng FROM provider_locations WHERE id = v_location_id;
      IF v_lat IS NOT NULL AND v_lng IS NOT NULL THEN
        INSERT INTO service_zones (provider_id, name, zone_type, center_latitude, center_longitude, radius_km, is_active, created_at, updated_at)
        VALUES (p_provider_id, 'Default Service Area', 'radius', v_lat, v_lng, 10.0, true, NOW(), NOW());
        v_result := jsonb_set(v_result, '{service_zone_created}', 'true'::jsonb);
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION ensure_freelancer_location IS 'Ensures a freelancer has a provider_locations row (location_type=base for distance); creates from user_addresses with latitude/longitude when available.';
