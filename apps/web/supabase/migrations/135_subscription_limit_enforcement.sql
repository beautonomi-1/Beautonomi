-- Migration: Subscription Limit Enforcement
-- 135_subscription_limit_enforcement.sql
-- Adds functions to check and enforce subscription plan limits

-- Function to get provider's current subscription plan with features
CREATE OR REPLACE FUNCTION get_provider_subscription_plan(provider_id_param UUID)
RETURNS TABLE (
  plan_id UUID,
  plan_name TEXT,
  is_free BOOLEAN,
  features JSONB,
  max_bookings_per_month INTEGER,
  max_staff_members INTEGER,
  max_locations INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sp.id,
    sp.name,
    COALESCE(sp.is_free, false),
    COALESCE(sp.features, '{}'::jsonb),
    sp.max_bookings_per_month,
    sp.max_staff_members,
    sp.max_locations
  FROM provider_subscriptions ps
  JOIN subscription_plans sp ON sp.id = ps.plan_id
  WHERE ps.provider_id = provider_id_param
  AND ps.status = 'active'
  AND (ps.expires_at IS NULL OR ps.expires_at > NOW())
  LIMIT 1;

  -- If no active subscription, return free tier if available
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      sp.id,
      sp.name,
      COALESCE(sp.is_free, false),
      COALESCE(sp.features, '{}'::jsonb),
      sp.max_bookings_per_month,
      sp.max_staff_members,
      sp.max_locations
    FROM subscription_plans sp
    WHERE sp.is_free = true
    AND sp.is_active = true
    ORDER BY sp.display_order
    LIMIT 1;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to count bookings for provider in current month
CREATE OR REPLACE FUNCTION count_provider_bookings_this_month(provider_id_param UUID)
RETURNS INTEGER AS $$
DECLARE
  booking_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO booking_count
  FROM bookings
  WHERE provider_id = provider_id_param
  AND status NOT IN ('cancelled', 'refunded')
  AND created_at >= date_trunc('month', CURRENT_DATE)
  AND created_at < date_trunc('month', CURRENT_DATE) + interval '1 month';
  
  RETURN COALESCE(booking_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to count messages sent by provider in current month
CREATE OR REPLACE FUNCTION count_provider_messages_this_month(provider_id_param UUID)
RETURNS INTEGER AS $$
DECLARE
  message_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO message_count
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  WHERE c.provider_id = provider_id_param
  AND m.sender_role = 'provider'
  AND m.created_at >= date_trunc('month', CURRENT_DATE)
  AND m.created_at < date_trunc('month', CURRENT_DATE) + interval '1 month';
  
  RETURN COALESCE(message_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to count active staff members for provider
CREATE OR REPLACE FUNCTION count_provider_staff_members(provider_id_param UUID)
RETURNS INTEGER AS $$
DECLARE
  staff_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO staff_count
  FROM provider_staff
  WHERE provider_id = provider_id_param
  AND is_active = true;
  
  RETURN COALESCE(staff_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to count locations for provider
CREATE OR REPLACE FUNCTION count_provider_locations(provider_id_param UUID)
RETURNS INTEGER AS $$
DECLARE
  location_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO location_count
  FROM provider_locations
  WHERE provider_id = provider_id_param
  AND is_active = true;
  
  RETURN COALESCE(location_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if provider can create booking (checks limit)
CREATE OR REPLACE FUNCTION can_provider_create_booking(provider_id_param UUID)
RETURNS TABLE (
  can_create BOOLEAN,
  reason TEXT,
  current_count INTEGER,
  limit_value INTEGER,
  plan_name TEXT
) AS $$
DECLARE
  plan_record RECORD;
  current_bookings INTEGER;
  max_bookings INTEGER;
  booking_limit_enabled BOOLEAN;
BEGIN
  -- Get subscription plan
  SELECT * INTO plan_record
  FROM get_provider_subscription_plan(provider_id_param)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'No active subscription plan', 0, 0, ''::TEXT;
    RETURN;
  END IF;

  -- Check booking_limits feature
  booking_limit_enabled := COALESCE((plan_record.features->'booking_limits'->>'enabled')::BOOLEAN, false);
  
  IF NOT booking_limit_enabled THEN
    RETURN QUERY SELECT true, 'Booking limits not enabled for this plan', 0, NULL::INTEGER, plan_record.plan_name;
    RETURN;
  END IF;

  -- Get limit from features or fallback to max_bookings_per_month
  max_bookings := COALESCE(
    (plan_record.features->'booking_limits'->>'max_bookings_per_month')::INTEGER,
    plan_record.max_bookings_per_month
  );

  -- If unlimited (NULL), allow
  IF max_bookings IS NULL THEN
    RETURN QUERY SELECT true, 'Unlimited bookings', 0, NULL::INTEGER, plan_record.plan_name;
    RETURN;
  END IF;

  -- Count current bookings
  SELECT count_provider_bookings_this_month(provider_id_param) INTO current_bookings;

  -- Check if limit reached
  IF current_bookings >= max_bookings THEN
    RETURN QUERY SELECT 
      false, 
      format('Monthly booking limit reached (%s/%s). Upgrade your plan to continue.', current_bookings, max_bookings),
      current_bookings,
      max_bookings,
      plan_record.plan_name;
  ELSE
    RETURN QUERY SELECT 
      true, 
      format('Bookings remaining: %s/%s', max_bookings - current_bookings, max_bookings),
      current_bookings,
      max_bookings,
      plan_record.plan_name;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if provider can send message (checks limit)
CREATE OR REPLACE FUNCTION can_provider_send_message(provider_id_param UUID)
RETURNS TABLE (
  can_send BOOLEAN,
  reason TEXT,
  current_count INTEGER,
  limit_value INTEGER,
  plan_name TEXT
) AS $$
DECLARE
  plan_record RECORD;
  current_messages INTEGER;
  max_messages INTEGER;
  chat_enabled BOOLEAN;
BEGIN
  -- Get subscription plan
  SELECT * INTO plan_record
  FROM get_provider_subscription_plan(provider_id_param)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'No active subscription plan', 0, 0, ''::TEXT;
    RETURN;
  END IF;

  -- Check chat_messages feature
  chat_enabled := COALESCE((plan_record.features->'chat_messages'->>'enabled')::BOOLEAN, false);
  
  IF NOT chat_enabled THEN
    RETURN QUERY SELECT false, 'Chat messages not enabled for this plan', 0, 0, plan_record.plan_name;
    RETURN;
  END IF;

  -- Get limit from features
  max_messages := (plan_record.features->'chat_messages'->>'max_messages_per_month')::INTEGER;

  -- If unlimited (NULL), allow
  IF max_messages IS NULL THEN
    RETURN QUERY SELECT true, 'Unlimited messages', 0, NULL::INTEGER, plan_record.plan_name;
    RETURN;
  END IF;

  -- Count current messages
  SELECT count_provider_messages_this_month(provider_id_param) INTO current_messages;

  -- Check if limit reached
  IF current_messages >= max_messages THEN
    RETURN QUERY SELECT 
      false, 
      format('Monthly message limit reached (%s/%s). Upgrade your plan to send more messages.', current_messages, max_messages),
      current_messages,
      max_messages,
      plan_record.plan_name;
  ELSE
    RETURN QUERY SELECT 
      true, 
      format('Messages remaining: %s/%s', max_messages - current_messages, max_messages),
      current_messages,
      max_messages,
      plan_record.plan_name;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if provider can add staff member (checks limit)
CREATE OR REPLACE FUNCTION can_provider_add_staff(provider_id_param UUID)
RETURNS TABLE (
  can_add BOOLEAN,
  reason TEXT,
  current_count INTEGER,
  limit_value INTEGER,
  plan_name TEXT
) AS $$
DECLARE
  plan_record RECORD;
  current_staff INTEGER;
  max_staff INTEGER;
  staff_enabled BOOLEAN;
BEGIN
  -- Get subscription plan
  SELECT * INTO plan_record
  FROM get_provider_subscription_plan(provider_id_param)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'No active subscription plan', 0, 0, ''::TEXT;
    RETURN;
  END IF;

  -- Check staff_management feature
  staff_enabled := COALESCE((plan_record.features->'staff_management'->>'enabled')::BOOLEAN, false);
  
  IF NOT staff_enabled THEN
    RETURN QUERY SELECT false, 'Staff management not enabled for this plan', 0, 0, plan_record.plan_name;
    RETURN;
  END IF;

  -- Get limit from features or fallback to max_staff_members
  max_staff := COALESCE(
    (plan_record.features->'staff_management'->>'max_staff_members')::INTEGER,
    plan_record.max_staff_members
  );

  -- If unlimited (NULL), allow
  IF max_staff IS NULL THEN
    RETURN QUERY SELECT true, 'Unlimited staff members', 0, NULL::INTEGER, plan_record.plan_name;
    RETURN;
  END IF;

  -- Count current staff
  SELECT count_provider_staff_members(provider_id_param) INTO current_staff;

  -- Check if limit reached
  IF current_staff >= max_staff THEN
    RETURN QUERY SELECT 
      false, 
      format('Staff member limit reached (%s/%s). Upgrade your plan to add more staff.', current_staff, max_staff),
      current_staff,
      max_staff,
      plan_record.plan_name;
  ELSE
    RETURN QUERY SELECT 
      true, 
      format('Staff slots remaining: %s/%s', max_staff - current_staff, max_staff),
      current_staff,
      max_staff,
      plan_record.plan_name;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if provider can add location (checks limit)
CREATE OR REPLACE FUNCTION can_provider_add_location(provider_id_param UUID)
RETURNS TABLE (
  can_add BOOLEAN,
  reason TEXT,
  current_count INTEGER,
  limit_value INTEGER,
  plan_name TEXT
) AS $$
DECLARE
  plan_record RECORD;
  current_locations INTEGER;
  max_locations INTEGER;
  multi_location_enabled BOOLEAN;
BEGIN
  -- Get subscription plan
  SELECT * INTO plan_record
  FROM get_provider_subscription_plan(provider_id_param)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'No active subscription plan', 0, 0, ''::TEXT;
    RETURN;
  END IF;

  -- Check multi_location feature
  multi_location_enabled := COALESCE((plan_record.features->'multi_location'->>'enabled')::BOOLEAN, false);
  
  IF NOT multi_location_enabled THEN
    RETURN QUERY SELECT false, 'Multiple locations not enabled for this plan', 0, 0, plan_record.plan_name;
    RETURN;
  END IF;

  -- Get limit from features or fallback to max_locations
  max_locations := COALESCE(
    (plan_record.features->'multi_location'->>'max_locations')::INTEGER,
    plan_record.max_locations
  );

  -- If unlimited (NULL), allow
  IF max_locations IS NULL THEN
    RETURN QUERY SELECT true, 'Unlimited locations', 0, NULL::INTEGER, plan_record.plan_name;
    RETURN;
  END IF;

  -- Count current locations
  SELECT count_provider_locations(provider_id_param) INTO current_locations;

  -- Check if limit reached
  IF current_locations >= max_locations THEN
    RETURN QUERY SELECT 
      false, 
      format('Location limit reached (%s/%s). Upgrade your plan to add more locations.', current_locations, max_locations),
      current_locations,
      max_locations,
      plan_record.plan_name;
  ELSE
    RETURN QUERY SELECT 
      true, 
      format('Location slots remaining: %s/%s', max_locations - current_locations, max_locations),
      current_locations,
      max_locations,
      plan_record.plan_name;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get provider's usage summary
CREATE OR REPLACE FUNCTION get_provider_usage_summary(provider_id_param UUID)
RETURNS TABLE (
  feature_type TEXT,
  current_usage INTEGER,
  limit_value INTEGER,
  percentage_used NUMERIC,
  is_unlimited BOOLEAN,
  can_use BOOLEAN,
  warning_threshold BOOLEAN
) AS $$
DECLARE
  plan_record RECORD;
  bookings_count INTEGER;
  messages_count INTEGER;
  staff_count INTEGER;
  locations_count INTEGER;
  max_bookings INTEGER;
  max_messages INTEGER;
  max_staff INTEGER;
  max_locations INTEGER;
BEGIN
  -- Get subscription plan
  SELECT * INTO plan_record
  FROM get_provider_subscription_plan(provider_id_param)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Get counts
  SELECT count_provider_bookings_this_month(provider_id_param) INTO bookings_count;
  SELECT count_provider_messages_this_month(provider_id_param) INTO messages_count;
  SELECT count_provider_staff_members(provider_id_param) INTO staff_count;
  SELECT count_provider_locations(provider_id_param) INTO locations_count;

  -- Get limits from features
  max_bookings := COALESCE(
    (plan_record.features->'booking_limits'->>'max_bookings_per_month')::INTEGER,
    plan_record.max_bookings_per_month
  );
  max_messages := (plan_record.features->'chat_messages'->>'max_messages_per_month')::INTEGER;
  max_staff := COALESCE(
    (plan_record.features->'staff_management'->>'max_staff_members')::INTEGER,
    plan_record.max_staff_members
  );
  max_locations := COALESCE(
    (plan_record.features->'multi_location'->>'max_locations')::INTEGER,
    plan_record.max_locations
  );

  -- Return usage summary for each feature
  IF max_bookings IS NOT NULL THEN
    RETURN QUERY SELECT 
      'bookings'::TEXT,
      bookings_count,
      max_bookings,
      CASE WHEN max_bookings > 0 THEN (bookings_count::NUMERIC / max_bookings * 100) ELSE 0 END,
      false,
      bookings_count < max_bookings,
      (bookings_count::NUMERIC / max_bookings * 100) >= 80;
  END IF;

  IF max_messages IS NOT NULL THEN
    RETURN QUERY SELECT 
      'messages'::TEXT,
      messages_count,
      max_messages,
      CASE WHEN max_messages > 0 THEN (messages_count::NUMERIC / max_messages * 100) ELSE 0 END,
      false,
      messages_count < max_messages,
      (messages_count::NUMERIC / max_messages * 100) >= 80;
  END IF;

  IF max_staff IS NOT NULL THEN
    RETURN QUERY SELECT 
      'staff'::TEXT,
      staff_count,
      max_staff,
      CASE WHEN max_staff > 0 THEN (staff_count::NUMERIC / max_staff * 100) ELSE 0 END,
      false,
      staff_count < max_staff,
      (staff_count::NUMERIC / max_staff * 100) >= 80;
  END IF;

  IF max_locations IS NOT NULL THEN
    RETURN QUERY SELECT 
      'locations'::TEXT,
      locations_count,
      max_locations,
      CASE WHEN max_locations > 0 THEN (locations_count::NUMERIC / max_locations * 100) ELSE 0 END,
      false,
      locations_count < max_locations,
      (locations_count::NUMERIC / max_locations * 100) >= 80;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON FUNCTION get_provider_subscription_plan IS 'Returns the active subscription plan details for a provider';
COMMENT ON FUNCTION count_provider_bookings_this_month IS 'Counts bookings created by provider in the current month';
COMMENT ON FUNCTION count_provider_messages_this_month IS 'Counts messages sent by provider in the current month';
COMMENT ON FUNCTION count_provider_staff_members IS 'Counts active staff members for a provider';
COMMENT ON FUNCTION count_provider_locations IS 'Counts active locations for a provider';
COMMENT ON FUNCTION can_provider_create_booking IS 'Checks if provider can create a booking based on subscription limits';
COMMENT ON FUNCTION can_provider_send_message IS 'Checks if provider can send a message based on subscription limits';
COMMENT ON FUNCTION can_provider_add_staff IS 'Checks if provider can add a staff member based on subscription limits';
COMMENT ON FUNCTION can_provider_add_location IS 'Checks if provider can add a location based on subscription limits';
COMMENT ON FUNCTION get_provider_usage_summary IS 'Returns usage summary for all subscription limits with warning thresholds';
