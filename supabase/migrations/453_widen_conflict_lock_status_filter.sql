-- Widen the booking conflict lock function to also exclude no_show and failed bookings.
-- These statuses should not block new slot reservations.

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
    AND b.status NOT IN ('cancelled', 'no_show', 'failed')
    AND bs.scheduled_start_at < p_end_at
    AND bs.scheduled_end_at > p_start_at
    FOR UPDATE OF bs;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
