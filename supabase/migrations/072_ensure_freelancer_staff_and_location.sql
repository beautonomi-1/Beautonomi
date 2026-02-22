-- Beautonomi Database Migration
-- 072_ensure_freelancer_staff_and_location.sql
-- Ensures freelancers are staff members and have location information for calendar bookings

-- Function to ensure freelancer is a staff member
CREATE OR REPLACE FUNCTION ensure_freelancer_staff(p_provider_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_user_name TEXT;
  v_user_email TEXT;
  v_user_phone TEXT;
  v_staff_exists BOOLEAN;
  v_staff_id UUID;
  v_result JSONB;
BEGIN
  -- Get provider and user info
  SELECT p.user_id, u.full_name, u.email, u.phone
  INTO v_user_id, v_user_name, v_user_email, v_user_phone
  FROM providers p
  LEFT JOIN users u ON u.id = p.user_id
  WHERE p.id = p_provider_id AND p.business_type = 'freelancer';
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Provider not found or not a freelancer';
  END IF;
  
  -- Check if staff entry already exists
  SELECT EXISTS(
    SELECT 1 FROM provider_staff
    WHERE provider_id = p_provider_id AND user_id = v_user_id
  ) INTO v_staff_exists;
  
  -- If staff doesn't exist, create it
  IF NOT v_staff_exists THEN
    INSERT INTO provider_staff (
      provider_id, 
      user_id, 
      name, 
      email,
      phone,
      role, 
      is_active,
      created_at,
      updated_at
    )
    VALUES (
      p_provider_id,
      v_user_id,
      COALESCE(v_user_name, 'Owner'),
      v_user_email,
      v_user_phone,
      'owner',
      true,
      NOW(),
      NOW()
    )
    RETURNING id INTO v_staff_id;
    
    v_result := jsonb_build_object(
      'success', true,
      'staff_created', true,
      'staff_id', v_staff_id
    );
  ELSE
    -- Update existing staff to ensure it's active and has correct role
    UPDATE provider_staff
    SET 
      role = 'owner',
      is_active = true,
      name = COALESCE(v_user_name, name),
      email = COALESCE(v_user_email, email),
      phone = COALESCE(v_user_phone, phone),
      updated_at = NOW()
    WHERE provider_id = p_provider_id AND user_id = v_user_id
    RETURNING id INTO v_staff_id;
    
    v_result := jsonb_build_object(
      'success', true,
      'staff_created', false,
      'staff_updated', true,
      'staff_id', v_staff_id
    );
  END IF;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to ensure freelancer has location information
CREATE OR REPLACE FUNCTION ensure_freelancer_location(p_provider_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_provider_name TEXT;
  v_location_exists BOOLEAN;
  v_service_zone_exists BOOLEAN;
  v_user_address JSONB;
  v_location_id UUID;
  v_lat NUMERIC;
  v_lng NUMERIC;
  v_result JSONB;
BEGIN
  -- Get provider info
  SELECT p.user_id, p.business_name
  INTO v_user_id, v_provider_name
  FROM providers p
  WHERE p.id = p_provider_id AND p.business_type = 'freelancer';
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Provider not found or not a freelancer';
  END IF;
  
  -- Get user address if available
  SELECT address INTO v_user_address
  FROM users
  WHERE id = v_user_id;
  
  -- Check if location exists
  SELECT EXISTS(
    SELECT 1 FROM provider_locations
    WHERE provider_id = p_provider_id AND is_active = true
  ) INTO v_location_exists;
  
  -- Check if service zone exists
  SELECT EXISTS(
    SELECT 1 FROM service_zones
    WHERE provider_id = p_provider_id AND is_active = true
  ) INTO v_service_zone_exists;
  
  -- If no location exists, try to create one from user address
  IF NOT v_location_exists AND v_user_address IS NOT NULL THEN
    INSERT INTO provider_locations (
      provider_id,
      name,
      address_line1,
      address_line2,
      city,
      state,
      country,
      postal_code,
      is_active,
      is_primary,
      working_hours,
      created_at,
      updated_at
    )
    VALUES (
      p_provider_id,
      COALESCE(v_provider_name, 'Home Location'),
      v_user_address->>'line1',
      v_user_address->>'line2',
      v_user_address->>'city',
      v_user_address->>'state',
      v_user_address->>'country',
      v_user_address->>'postal_code',
      true,
      true,
      -- Default working hours: Monday-Friday 9am-6pm, Saturday 9am-1pm, Sunday closed
      '{"monday":{"open":"09:00","close":"18:00","closed":false},"tuesday":{"open":"09:00","close":"18:00","closed":false},"wednesday":{"open":"09:00","close":"18:00","closed":false},"thursday":{"open":"09:00","close":"18:00","closed":false},"friday":{"open":"09:00","close":"18:00","closed":false},"saturday":{"open":"09:00","close":"13:00","closed":false},"sunday":{"open":"09:00","close":"18:00","closed":true}}'::jsonb,
      NOW(),
      NOW()
    )
    RETURNING id INTO v_location_id;
    
    v_result := jsonb_build_object(
      'success', true,
      'location_created', true,
      'location_id', v_location_id,
      'from_user_address', true
    );
  ELSIF v_location_exists THEN
    -- Location exists, just return success
    SELECT id INTO v_location_id
    FROM provider_locations
    WHERE provider_id = p_provider_id AND is_active = true
    LIMIT 1;
    
    v_result := jsonb_build_object(
      'success', true,
      'location_created', false,
      'location_exists', true,
      'location_id', v_location_id
    );
  ELSE
    -- No location and no user address - return warning
    v_result := jsonb_build_object(
      'success', false,
      'location_created', false,
      'location_exists', false,
      'warning', 'No location found and no user address available. Please add a location manually.'
    );
  END IF;
  
  -- If no service zone exists, create a default one (for at-home services)
  IF NOT v_service_zone_exists AND v_location_id IS NOT NULL THEN
    -- Get location coordinates if available
    BEGIN
      SELECT latitude, longitude INTO v_lat, v_lng
      FROM provider_locations
      WHERE id = v_location_id;
      
      -- Create a default service zone (10km radius) if we have coordinates
      IF v_lat IS NOT NULL AND v_lng IS NOT NULL THEN
        INSERT INTO service_zones (
          provider_id,
          name,
          zone_type,
          center_latitude,
          center_longitude,
          radius_km,
          is_active,
          created_at,
          updated_at
        )
        VALUES (
          p_provider_id,
          'Default Service Area',
          'radius',
          v_lat,
          v_lng,
          10.0, -- 10km default radius
          true,
          NOW(),
          NOW()
        );
        
        v_result := jsonb_set(
          v_result,
          '{service_zone_created}',
          'true'::jsonb
        );
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        -- Ignore errors when creating service zone
        NULL;
    END;
  END IF;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to ensure freelancer setup (staff + location)
CREATE OR REPLACE FUNCTION ensure_freelancer_setup(p_provider_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_staff_result JSONB;
  v_location_result JSONB;
  v_result JSONB;
BEGIN
  -- Ensure staff
  SELECT ensure_freelancer_staff(p_provider_id) INTO v_staff_result;
  
  -- Ensure location
  SELECT ensure_freelancer_location(p_provider_id) INTO v_location_result;
  
  -- Combine results
  v_result := jsonb_build_object(
    'success', true,
    'provider_id', p_provider_id,
    'staff', v_staff_result,
    'location', v_location_result
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger function to automatically ensure freelancer setup when provider is created/updated
CREATE OR REPLACE FUNCTION trigger_ensure_freelancer_setup()
RETURNS TRIGGER AS $$
BEGIN
  -- Only run for freelancers
  IF NEW.business_type = 'freelancer' THEN
    -- Run in background (fire and forget) to avoid blocking the transaction
    PERFORM pg_notify('ensure_freelancer_setup', NEW.id::text);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS ensure_freelancer_setup_trigger ON providers;
CREATE TRIGGER ensure_freelancer_setup_trigger
  AFTER INSERT OR UPDATE OF business_type ON providers
  FOR EACH ROW
  WHEN (NEW.business_type = 'freelancer')
  EXECUTE FUNCTION trigger_ensure_freelancer_setup();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION ensure_freelancer_staff(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION ensure_freelancer_staff(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION ensure_freelancer_location(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION ensure_freelancer_location(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION ensure_freelancer_setup(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION ensure_freelancer_setup(UUID) TO service_role;

-- Add comments
COMMENT ON FUNCTION ensure_freelancer_staff IS 'Ensures a freelancer provider has a staff member entry (the owner) for calendar bookings';
COMMENT ON FUNCTION ensure_freelancer_location IS 'Ensures a freelancer provider has location information (provider_locations or service_zones) for at-home services';
COMMENT ON FUNCTION ensure_freelancer_setup IS 'Ensures a freelancer provider has both staff and location setup';

-- Function to ensure locations have default working hours if missing
CREATE OR REPLACE FUNCTION ensure_location_working_hours(p_provider_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_location RECORD;
  v_updated_count INTEGER := 0;
  v_default_hours JSONB := '{"monday":{"open":"09:00","close":"18:00","closed":false},"tuesday":{"open":"09:00","close":"18:00","closed":false},"wednesday":{"open":"09:00","close":"18:00","closed":false},"thursday":{"open":"09:00","close":"18:00","closed":false},"friday":{"open":"09:00","close":"18:00","closed":false},"saturday":{"open":"09:00","close":"13:00","closed":false},"sunday":{"open":"09:00","close":"18:00","closed":true}}'::jsonb;
BEGIN
  -- Update locations that don't have working hours or have empty working hours
  FOR v_location IN 
    SELECT id FROM provider_locations 
    WHERE provider_id = p_provider_id 
      AND is_active = true
      AND (
        working_hours IS NULL 
        OR working_hours = '{}'::jsonb
        OR NOT (working_hours ? 'monday' AND working_hours ? 'tuesday')
      )
  LOOP
    UPDATE provider_locations
    SET 
      working_hours = v_default_hours,
      updated_at = NOW()
    WHERE id = v_location.id;
    
    v_updated_count := v_updated_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'locations_updated', v_updated_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION ensure_location_working_hours(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION ensure_location_working_hours(UUID) TO service_role;

COMMENT ON FUNCTION ensure_location_working_hours IS 'Ensures provider locations have default working hours if missing';

-- Run for existing freelancers
DO $$
DECLARE
  v_provider RECORD;
BEGIN
  FOR v_provider IN 
    SELECT id FROM providers WHERE business_type = 'freelancer'
  LOOP
    BEGIN
      PERFORM ensure_freelancer_setup(v_provider.id);
      -- Also ensure working hours are set
      PERFORM ensure_location_working_hours(v_provider.id);
    EXCEPTION
      WHEN OTHERS THEN
        -- Log error but continue with other providers
        RAISE WARNING 'Failed to setup freelancer %: %', v_provider.id, SQLERRM;
    END;
  END LOOP;
END $$;
