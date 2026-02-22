-- Beautonomi Database Migration
-- 149_fix_provider_client_stats_calculation.sql
-- Fixes provider_clients stats to include all bookings (not just completed)
-- Total visits should count all non-cancelled bookings
-- Total spent should sum all paid bookings (payment_status = 'paid' or 'partially_paid')

-- ============================================================================
-- 1. Update the trigger function to recalculate stats from all bookings
-- ============================================================================
-- This approach recalculates from scratch for accuracy
CREATE OR REPLACE FUNCTION update_provider_client_stats()
RETURNS TRIGGER AS $$
DECLARE
  booking_count INTEGER;
  total_spent_amount NUMERIC(10, 2);
  last_service TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Recalculate stats from all bookings for this provider-customer pair
    -- This ensures accuracy regardless of status changes
    SELECT 
      COUNT(*)::INTEGER,
      COALESCE(SUM(
        CASE 
          WHEN payment_status IN ('paid', 'partially_paid') THEN total_amount
          ELSE 0
        END
      ), 0),
      MAX(COALESCE(completed_at, scheduled_at))
    INTO 
      booking_count,
      total_spent_amount,
      last_service
    FROM bookings
    WHERE provider_id = COALESCE(NEW.provider_id, OLD.provider_id)
      AND customer_id = COALESCE(NEW.customer_id, OLD.customer_id)
      AND status NOT IN ('cancelled', 'no_show');
    
    -- Insert or update client stats
    INSERT INTO provider_clients (provider_id, customer_id, last_service_date, total_bookings, total_spent)
    VALUES (
        COALESCE(NEW.provider_id, OLD.provider_id),
        COALESCE(NEW.customer_id, OLD.customer_id),
        last_service,
        booking_count,
        total_spent_amount
    )
    ON CONFLICT (provider_id, customer_id)
    DO UPDATE SET
        last_service_date = last_service,
        total_bookings = booking_count,
        total_spent = total_spent_amount,
        updated_at = NOW();
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. Update the trigger to fire on all status and payment changes
-- ============================================================================
DROP TRIGGER IF EXISTS on_booking_completed_for_client_stats ON bookings;
DROP TRIGGER IF EXISTS on_booking_status_change_for_client_stats ON bookings;
CREATE TRIGGER on_booking_status_change_for_client_stats
    AFTER INSERT OR UPDATE OR DELETE ON bookings
    FOR EACH ROW
    WHEN (
        -- Fire on any status change, payment status change, or new booking
        TG_OP = 'INSERT'
        OR TG_OP = 'DELETE'
        OR (TG_OP = 'UPDATE' AND (
            NEW.status IS DISTINCT FROM OLD.status 
            OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
            OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
        ))
    )
    EXECUTE FUNCTION update_provider_client_stats();

-- ============================================================================
-- 3. Update the recalculation function to include all bookings
-- ============================================================================
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
    -- Count all non-cancelled bookings
    SELECT 
      COUNT(*)::INTEGER,
      COALESCE(SUM(
        CASE 
          WHEN payment_status IN ('paid', 'partially_paid') THEN total_amount
          ELSE 0
        END
      ), 0),
      MAX(COALESCE(completed_at, scheduled_at))
    INTO 
      booking_count,
      total_spent_amount,
      last_service
    FROM bookings
    WHERE provider_id = client_record.provider_id
      AND customer_id = client_record.customer_id
      AND status NOT IN ('cancelled', 'no_show');
    
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

-- ============================================================================
-- 4. Recalculate all stats with the new logic
-- ============================================================================
SELECT recalculate_provider_client_stats();

-- ============================================================================
-- 5. Also handle bookings that don't have provider_clients records yet
-- ============================================================================
-- Create provider_clients records for customers who have bookings but aren't saved
INSERT INTO provider_clients (provider_id, customer_id, total_bookings, total_spent, last_service_date)
SELECT 
  b.provider_id,
  b.customer_id,
  COUNT(*)::INTEGER as booking_count,
  COALESCE(SUM(
    CASE 
      WHEN b.payment_status IN ('paid', 'partially_paid') THEN b.total_amount
      ELSE 0
    END
  ), 0) as total_spent,
  MAX(COALESCE(b.completed_at, b.scheduled_at)) as last_service
FROM bookings b
WHERE b.status NOT IN ('cancelled', 'no_show')
  AND NOT EXISTS (
    SELECT 1 FROM provider_clients pc
    WHERE pc.provider_id = b.provider_id
      AND pc.customer_id = b.customer_id
  )
GROUP BY b.provider_id, b.customer_id
ON CONFLICT (provider_id, customer_id) DO NOTHING;

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON FUNCTION update_provider_client_stats IS 'Updates provider_clients stats for all booking statuses (not just completed). Counts all non-cancelled bookings and sums paid amounts.';
COMMENT ON FUNCTION recalculate_provider_client_stats IS 'Recalculates provider_clients stats from all bookings. Counts all non-cancelled bookings and sums amounts from paid bookings.';
