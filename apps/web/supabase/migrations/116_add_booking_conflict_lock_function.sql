-- Beautonomi Database Migration
-- 116_add_booking_conflict_lock_function.sql
-- Creates function to lock booking services for conflict checking with SELECT FOR UPDATE

-- Function to lock booking services for a time range
-- This is used in transactions to prevent race conditions
CREATE OR REPLACE FUNCTION lock_booking_services_for_update(
    p_staff_id UUID,
    p_start_at TIMESTAMP WITH TIME ZONE,
    p_end_at TIMESTAMP WITH TIME ZONE
)
RETURNS TABLE (
    id UUID,
    booking_id UUID,
    scheduled_start_at TIMESTAMP WITH TIME ZONE,
    scheduled_end_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        bs.id,
        bs.booking_id,
        bs.scheduled_start_at,
        bs.scheduled_end_at
    FROM booking_services bs
    INNER JOIN bookings b ON b.id = bs.booking_id
    WHERE bs.staff_id = p_staff_id
    AND b.status != 'cancelled'
    AND bs.scheduled_start_at < p_end_at
    AND bs.scheduled_end_at > p_start_at
    FOR UPDATE OF bs;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check resource availability with locking
CREATE OR REPLACE FUNCTION lock_booking_resources_for_update(
    p_resource_id UUID,
    p_start_at TIMESTAMP WITH TIME ZONE,
    p_end_at TIMESTAMP WITH TIME ZONE
)
RETURNS TABLE (
    id UUID,
    booking_id UUID,
    scheduled_start_at TIMESTAMP WITH TIME ZONE,
    scheduled_end_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        br.id,
        br.booking_id,
        br.scheduled_start_at,
        br.scheduled_end_at
    FROM booking_resources br
    INNER JOIN bookings b ON b.id = br.booking_id
    WHERE br.resource_id = p_resource_id
    AND b.status != 'cancelled'
    AND br.scheduled_start_at < p_end_at
    AND br.scheduled_end_at > p_start_at
    FOR UPDATE OF br;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
