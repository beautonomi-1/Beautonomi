-- `booking_status` has never included `failed` (that label exists on payment enums).
-- Migrations 453/454 compared `b.status` to `'failed'`, which makes PostgreSQL cast the
-- literal to booking_status and raises 22P02, breaking lock RPCs and downstream booking creation.
-- Exclude only real non-blocking booking statuses.

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
    AND b.status NOT IN ('cancelled', 'no_show')
    AND bs.scheduled_start_at < p_end_at
    AND bs.scheduled_end_at > p_start_at
    FOR UPDATE OF bs;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
    AND b.status NOT IN ('cancelled', 'no_show')
    AND br.scheduled_start_at < p_end_at
    AND br.scheduled_end_at > p_start_at
    FOR UPDATE OF br;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
