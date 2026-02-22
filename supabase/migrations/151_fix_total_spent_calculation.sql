-- Beautonomi Database Migration
-- 151_fix_total_spent_calculation.sql
-- Fixes total_spent calculation to use total_paid for partially_paid bookings
-- For partially_paid bookings, we should sum total_paid, not total_amount

-- ============================================================================
-- 1. Update the trigger function to use total_paid for partially_paid bookings
-- ============================================================================
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
          WHEN payment_status::TEXT = 'paid' THEN total_amount
          WHEN payment_status::TEXT = 'partially_paid' THEN total_paid
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
-- 2. Update the recalculation function to use total_paid for partially_paid bookings
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
    -- For total_spent: use total_amount for 'paid', total_paid for 'partially_paid'
    SELECT 
      COUNT(*)::INTEGER,
      COALESCE(SUM(
        CASE 
          WHEN payment_status::TEXT = 'paid' THEN total_amount
          WHEN payment_status::TEXT = 'partially_paid' THEN total_paid
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
-- 3. Recalculate all stats with the corrected logic
-- ============================================================================
SELECT recalculate_provider_client_stats();

-- ============================================================================
-- 4. Also handle bookings that don't have provider_clients records yet
-- ============================================================================
-- Create provider_clients records for customers who have bookings but aren't saved
INSERT INTO provider_clients (provider_id, customer_id, total_bookings, total_spent, last_service_date)
SELECT 
  b.provider_id,
  b.customer_id,
  COUNT(*)::INTEGER as booking_count,
  COALESCE(SUM(
    CASE 
      WHEN b.payment_status::TEXT = 'paid' THEN b.total_amount
      WHEN b.payment_status::TEXT = 'partially_paid' THEN b.total_paid
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
COMMENT ON FUNCTION update_provider_client_stats IS 'Updates provider_clients stats. For total_spent: uses total_amount for paid bookings, total_paid for partially_paid bookings.';
COMMENT ON FUNCTION recalculate_provider_client_stats IS 'Recalculates provider_clients stats. For total_spent: uses total_amount for paid bookings, total_paid for partially_paid bookings.';
