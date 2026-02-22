-- Migration: Auto-assign freelancers to their locations
-- This ensures that when a freelancer is created, they are automatically assigned to their location(s)
-- Also updates the ensure_freelancer_staff function to create location assignments

-- Update ensure_freelancer_staff to also assign freelancer to their locations
CREATE OR REPLACE FUNCTION ensure_freelancer_staff(p_provider_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_user_name TEXT;
  v_user_email TEXT;
  v_user_phone TEXT;
  v_staff_exists BOOLEAN;
  v_staff_id UUID;
  v_location_id UUID;
  v_result JSONB;
  v_location_assigned BOOLEAN := false;
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
  END IF;
  
  -- Get the staff_id if we didn't set it above (shouldn't happen, but safety check)
  IF v_staff_id IS NULL THEN
    SELECT id INTO v_staff_id
    FROM provider_staff
    WHERE provider_id = p_provider_id AND user_id = v_user_id
    LIMIT 1;
  END IF;
  
  -- Assign freelancer to all their active locations
  -- Get primary location first (or first active location)
  SELECT id INTO v_location_id
  FROM provider_locations
  WHERE provider_id = p_provider_id 
    AND is_active = true
  ORDER BY is_primary DESC, created_at ASC
  LIMIT 1;
  
  -- If location exists, ensure staff is assigned to it
  IF v_location_id IS NOT NULL THEN
    -- Check if assignment already exists
    SELECT EXISTS(
      SELECT 1 FROM provider_staff_locations
      WHERE staff_id = v_staff_id AND location_id = v_location_id
    ) INTO v_location_assigned;
    
    -- If not assigned, create assignment
    IF NOT v_location_assigned THEN
      INSERT INTO provider_staff_locations (
        staff_id,
        location_id,
        is_primary,
        created_at,
        updated_at
      )
      VALUES (
        v_staff_id,
        v_location_id,
        true, -- Freelancer's location is always primary
        NOW(),
        NOW()
      )
      ON CONFLICT (staff_id, location_id) DO NOTHING;
      
      v_location_assigned := true;
    ELSE
      -- Update existing assignment to ensure is_primary is true
      UPDATE provider_staff_locations
      SET is_primary = true,
          updated_at = NOW()
      WHERE staff_id = v_staff_id AND location_id = v_location_id;
    END IF;
    
    -- Also assign to any other active locations (non-primary)
    INSERT INTO provider_staff_locations (
      staff_id,
      location_id,
      is_primary,
      created_at,
      updated_at
    )
    SELECT 
      v_staff_id,
      pl.id,
      false,
      NOW(),
      NOW()
    FROM provider_locations pl
    WHERE pl.provider_id = p_provider_id
      AND pl.is_active = true
      AND pl.id != v_location_id
      AND NOT EXISTS (
        SELECT 1 FROM provider_staff_locations psl
        WHERE psl.staff_id = v_staff_id AND psl.location_id = pl.id
      )
    ON CONFLICT (staff_id, location_id) DO NOTHING;
  END IF;
  
  v_result := jsonb_build_object(
    'success', true,
    'staff_created', NOT v_staff_exists,
    'staff_updated', v_staff_exists,
    'staff_id', v_staff_id,
    'location_assigned', v_location_assigned,
    'location_id', v_location_id
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update ensure_freelancer_setup to ensure location assignment happens
CREATE OR REPLACE FUNCTION ensure_freelancer_setup(p_provider_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_staff_result JSONB;
  v_location_result JSONB;
  v_result JSONB;
BEGIN
  -- Ensure location first (so staff can be assigned to it)
  SELECT ensure_freelancer_location(p_provider_id) INTO v_location_result;
  
  -- Ensure staff (which will also assign to locations)
  SELECT ensure_freelancer_staff(p_provider_id) INTO v_staff_result;
  
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

-- Auto-assign existing freelancers to their locations
DO $$
DECLARE
  v_provider RECORD;
  v_staff_id UUID;
  v_location_id UUID;
  v_assigned_count INTEGER := 0;
BEGIN
  FOR v_provider IN 
    SELECT p.id, p.user_id
    FROM providers p
    WHERE p.business_type = 'freelancer'
  LOOP
    BEGIN
      -- Get freelancer's staff ID
      SELECT id INTO v_staff_id
      FROM provider_staff
      WHERE provider_id = v_provider.id 
        AND user_id = v_provider.user_id
      LIMIT 1;
      
      -- If staff exists, assign to all active locations
      IF v_staff_id IS NOT NULL THEN
        -- Get primary location (or first active)
        SELECT id INTO v_location_id
        FROM provider_locations
        WHERE provider_id = v_provider.id 
          AND is_active = true
        ORDER BY is_primary DESC, created_at ASC
        LIMIT 1;
        
        -- Assign to primary location
        IF v_location_id IS NOT NULL THEN
          INSERT INTO provider_staff_locations (
            staff_id,
            location_id,
            is_primary,
            created_at,
            updated_at
          )
          VALUES (
            v_staff_id,
            v_location_id,
            true,
            NOW(),
            NOW()
          )
          ON CONFLICT (staff_id, location_id) DO UPDATE
          SET is_primary = true,
              updated_at = NOW();
          
          v_assigned_count := v_assigned_count + 1;
          
          -- Assign to other active locations (non-primary)
          INSERT INTO provider_staff_locations (
            staff_id,
            location_id,
            is_primary,
            created_at,
            updated_at
          )
          SELECT 
            v_staff_id,
            pl.id,
            false,
            NOW(),
            NOW()
          FROM provider_locations pl
          WHERE pl.provider_id = v_provider.id
            AND pl.is_active = true
            AND pl.id != v_location_id
            AND NOT EXISTS (
              SELECT 1 FROM provider_staff_locations psl
              WHERE psl.staff_id = v_staff_id AND psl.location_id = pl.id
            )
          ON CONFLICT (staff_id, location_id) DO NOTHING;
        END IF;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        -- Log error but continue with other providers
        RAISE WARNING 'Failed to assign freelancer % to locations: %', v_provider.id, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE 'Assigned % freelancers to their locations', v_assigned_count;
END $$;

-- Add comment
COMMENT ON FUNCTION ensure_freelancer_staff IS 'Ensures a freelancer provider has a staff member entry (the owner) and assigns them to their location(s)';
