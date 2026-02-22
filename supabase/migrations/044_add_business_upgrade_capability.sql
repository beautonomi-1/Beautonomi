-- Beautonomi Database Migration
-- 044_add_business_upgrade_capability.sql
-- Adds capability system and upgrade path from freelancer to salon

-- Add capabilities column to providers
ALTER TABLE providers 
ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '{}';

-- Initialize capabilities from business_type for existing providers
UPDATE providers 
SET capabilities = CASE
  WHEN business_type = 'freelancer' THEN 
    jsonb_build_object(
      'has_staff', false,
      'has_multiple_locations', false,
      'max_staff', 0,
      'max_locations', 1,
      'supports_at_home', true,
      'supports_at_salon', true
    )
  WHEN business_type = 'salon' THEN
    jsonb_build_object(
      'has_staff', true,
      'has_multiple_locations', true,
      'max_staff', 999,
      'max_locations', 999,
      'supports_at_home', true,
      'supports_at_salon', true
    )
END
WHERE capabilities = '{}'::jsonb OR capabilities IS NULL;

-- Create index for capabilities queries
CREATE INDEX IF NOT EXISTS idx_providers_capabilities ON providers USING GIN (capabilities);

-- Function to upgrade freelancer to salon
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
  -- Validate provider exists and is a freelancer
  SELECT user_id INTO v_user_id
  FROM providers
  WHERE id = p_provider_id AND business_type = 'freelancer';
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Provider not found or already a salon';
  END IF;
  
  -- Get user details
  SELECT full_name, email INTO v_user_name, v_user_email
  FROM users
  WHERE id = v_user_id;
  
  -- Check if staff entry already exists
  SELECT EXISTS(
    SELECT 1 FROM provider_staff
    WHERE provider_id = p_provider_id AND user_id = v_user_id
  ) INTO v_staff_exists;
  
  -- Check if location exists
  SELECT EXISTS(
    SELECT 1 FROM provider_locations
    WHERE provider_id = p_provider_id AND is_active = true
  ) INTO v_location_exists;
  
  -- Update business type and capabilities
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
  
  -- Create owner staff entry if doesn't exist
  IF NOT v_staff_exists THEN
    INSERT INTO provider_staff (
      provider_id, 
      user_id, 
      name, 
      email,
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
      'owner',
      true,
      NOW(),
      NOW()
    );
  END IF;
  
  -- Mark first active location as primary if exists and not already primary
  IF v_location_exists THEN
    UPDATE provider_locations
    SET 
      is_primary = true,
      updated_at = NOW()
    WHERE provider_id = p_provider_id
    AND is_active = true
    AND is_primary = false
    AND id = (
      SELECT id FROM provider_locations
      WHERE provider_id = p_provider_id
      AND is_active = true
      ORDER BY created_at ASC
      LIMIT 1
    );
  END IF;
  
  -- Return success result
  v_result := jsonb_build_object(
    'success', true,
    'provider_id', p_provider_id,
    'staff_created', NOT v_staff_exists,
    'location_updated', v_location_exists
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION upgrade_freelancer_to_salon(UUID) TO authenticated;

-- Add comment
COMMENT ON FUNCTION upgrade_freelancer_to_salon IS 'Upgrades a freelancer provider to salon status, creating owner staff entry and updating capabilities';

-- Add comment to capabilities column
COMMENT ON COLUMN providers.capabilities IS 'Feature capabilities and limits for the provider. Controls staff, locations, and other features independently of business_type.';
