-- Align lock_booking_resources_for_update status filter with lock_booking_services_for_update.
-- Migration 453 widened the staff lock to exclude cancelled, no_show, and failed bookings.
-- The resource lock still only excludes cancelled, causing no-show/failed bookings to
-- incorrectly block resource allocation for new bookings.

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
    AND b.status NOT IN ('cancelled', 'no_show', 'failed')
    AND br.scheduled_start_at < p_end_at
    AND br.scheduled_end_at > p_start_at
    FOR UPDATE OF br;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
