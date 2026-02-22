-- Migration: Recalculate provider_clients stats from actual bookings
-- This ensures total_bookings and total_spent are accurate based on completed bookings

-- Function to recalculate provider client stats
CREATE OR REPLACE FUNCTION recalculate_provider_client_stats()
RETURNS void AS $$
DECLARE
  client_record RECORD;
  booking_count INTEGER;
  total_spent_amount NUMERIC(10, 2);
  last_service TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Loop through all provider_clients records
  FOR client_record IN
    SELECT DISTINCT provider_id, customer_id
    FROM provider_clients
  LOOP
    -- Count completed bookings and calculate totals
    SELECT 
      COUNT(*)::INTEGER,
      COALESCE(SUM(total_amount), 0),
      MAX(completed_at)
    INTO 
      booking_count,
      total_spent_amount,
      last_service
    FROM bookings
    WHERE provider_id = client_record.provider_id
      AND customer_id = client_record.customer_id
      AND status = 'completed';
    
    -- Update the provider_clients record with accurate stats
    UPDATE provider_clients
    SET 
      total_bookings = booking_count,
      total_spent = total_spent_amount,
      last_service_date = last_service,
      updated_at = NOW()
    WHERE provider_id = client_record.provider_id
      AND customer_id = client_record.customer_id;
    
    RAISE NOTICE 'Updated client % for provider %: % bookings, R% spent', 
      client_record.customer_id, 
      client_record.provider_id, 
      booking_count, 
      total_spent_amount;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Run the recalculation
SELECT recalculate_provider_client_stats();

-- Drop the temporary function (optional - you can keep it for future use)
-- DROP FUNCTION IF EXISTS recalculate_provider_client_stats();
