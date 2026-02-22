-- Migration: Backfill missing user records for customers who have bookings but no user record
-- This fixes the issue where walk-in customers have bookings but their user record wasn't created

-- Function to backfill missing user records from bookings
CREATE OR REPLACE FUNCTION backfill_missing_user_records()
RETURNS TABLE(
  customer_id UUID,
  bookings_count BIGINT,
  created BOOLEAN
) AS $$
DECLARE
  booking_record RECORD;
  walk_in_email TEXT;
  user_exists BOOLEAN;
BEGIN
  -- Find all unique customer_ids from bookings that don't have a corresponding user record
  FOR booking_record IN
    SELECT DISTINCT b.customer_id, COUNT(*) as booking_count
    FROM bookings b
    WHERE b.customer_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM users u WHERE u.id = b.customer_id
      )
    GROUP BY b.customer_id
  LOOP
    -- Check if auth user exists
    SELECT EXISTS(
      SELECT 1 FROM auth.users WHERE id = booking_record.customer_id
    ) INTO user_exists;
    
    IF user_exists THEN
      -- Auth user exists but public.users record is missing - create it
      walk_in_email := COALESCE(
        (SELECT email FROM auth.users WHERE id = booking_record.customer_id),
        'walkin+' || booking_record.customer_id::TEXT || '@beautonomi.invalid'
      );
      
      INSERT INTO public.users (id, email, full_name, role)
      VALUES (
        booking_record.customer_id,
        walk_in_email,
        COALESCE(
          (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = booking_record.customer_id),
          (SELECT raw_user_meta_data->>'name' FROM auth.users WHERE id = booking_record.customer_id),
          'Walk-in Customer'
        ),
        COALESCE(
          (SELECT (raw_user_meta_data->>'role')::user_role FROM auth.users WHERE id = booking_record.customer_id),
          'customer'
        )
      )
      ON CONFLICT (id) DO NOTHING;
      
      RETURN QUERY SELECT booking_record.customer_id, booking_record.booking_count, TRUE;
    ELSE
      -- Neither auth user nor public.users exists - this is a data integrity issue
      -- Log it but don't create a user (would need to create auth user first)
      RETURN QUERY SELECT booking_record.customer_id, booking_record.booking_count, FALSE;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run the backfill function
-- This will create user records for all customers who have bookings but no user record
DO $$
DECLARE
  result RECORD;
  total_created INTEGER := 0;
  total_failed INTEGER := 0;
BEGIN
  FOR result IN SELECT * FROM backfill_missing_user_records() LOOP
    IF result.created THEN
      total_created := total_created + 1;
      RAISE NOTICE 'Created user record for customer % with % bookings', result.customer_id, result.bookings_count;
    ELSE
      total_failed := total_failed + 1;
      RAISE WARNING 'Could not create user record for customer % (no auth user exists)', result.customer_id;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Backfill complete: % user records created, % failed', total_created, total_failed;
END $$;

-- Clean up the function (optional - you can keep it for future use)
-- DROP FUNCTION IF EXISTS backfill_missing_user_records();
