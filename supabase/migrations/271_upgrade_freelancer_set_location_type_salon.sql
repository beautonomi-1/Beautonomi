-- When upgrading freelancer to salon, set their first active location to location_type = 'salon'
-- so they can accept in-studio bookings without adding a second location (seamless upgrade).

CREATE OR REPLACE FUNCTION upgrade_freelancer_to_salon(p_provider_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_user_name TEXT;
  v_user_email TEXT;
  v_staff_exists BOOLEAN;
  v_location_exists BOOLEAN;
  v_result JSONB;
BEGIN
  SELECT user_id INTO v_user_id
  FROM providers
  WHERE id = p_provider_id AND business_type = 'freelancer';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Provider not found or already a salon';
  END IF;

  SELECT full_name, email INTO v_user_name, v_user_email
  FROM users
  WHERE id = v_user_id;

  SELECT EXISTS(
    SELECT 1 FROM provider_staff
    WHERE provider_id = p_provider_id AND user_id = v_user_id
  ) INTO v_staff_exists;

  SELECT EXISTS(
    SELECT 1 FROM provider_locations
    WHERE provider_id = p_provider_id AND is_active = true
  ) INTO v_location_exists;

  UPDATE providers
  SET
    business_type = 'salon',
    capabilities = jsonb_build_object(
      'has_staff', true,
      'has_multiple_locations', true,
      'max_staff', 999,
      'max_locations', 999,
      'supports_at_home', true,
      'supports_at_salon', true,
      'upgraded_at', NOW()::text,
      'upgraded_from', 'freelancer'
    ),
    updated_at = NOW()
  WHERE id = p_provider_id;

  IF NOT v_staff_exists THEN
    INSERT INTO provider_staff (
      provider_id, user_id, name, email, role, is_active, created_at, updated_at
    )
    VALUES (
      p_provider_id, v_user_id, COALESCE(v_user_name, 'Owner'), v_user_email,
      'owner', true, NOW(), NOW()
    );
  END IF;

  -- Mark first active location as primary and set location_type = 'salon' so in-studio bookings are enabled
  IF v_location_exists THEN
    UPDATE provider_locations
    SET
      is_primary = true,
      location_type = 'salon',
      updated_at = NOW()
    WHERE provider_id = p_provider_id
      AND is_active = true
      AND id = (
        SELECT id FROM provider_locations
        WHERE provider_id = p_provider_id AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1
      );
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'provider_id', p_provider_id,
    'staff_created', NOT v_staff_exists,
    'location_updated', v_location_exists
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION upgrade_freelancer_to_salon IS 'Upgrades a freelancer to salon: updates business_type, capabilities, ensures staff, and sets first location to location_type=salon for in-studio bookings.';
