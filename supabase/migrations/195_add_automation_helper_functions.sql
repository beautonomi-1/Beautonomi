-- ============================================================================
-- Migration 195: Add Helper Functions for Automation Triggers
-- ============================================================================
-- This migration adds database functions needed for automation trigger logic
-- ============================================================================

-- Function to get clients by visit count (for visit milestones)
CREATE OR REPLACE FUNCTION get_clients_by_visit_count(
    p_provider_id UUID,
    p_visit_count INTEGER
)
RETURNS TABLE (
    id UUID,
    visit_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.customer_id as id,
        COUNT(*)::BIGINT as visit_count
    FROM bookings b
    WHERE b.provider_id = p_provider_id
        AND b.status IN ('completed', 'confirmed')
    GROUP BY b.customer_id
    HAVING COUNT(*) = p_visit_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get clients by first booking date (for anniversaries)
CREATE OR REPLACE FUNCTION get_clients_by_first_booking_date(
    p_provider_id UUID,
    p_years_ago INTEGER
)
RETURNS TABLE (
    id UUID,
    first_booking_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.customer_id as id,
        MIN(b.scheduled_at) as first_booking_date
    FROM bookings b
    WHERE b.provider_id = p_provider_id
        AND b.status IN ('completed', 'confirmed')
    GROUP BY b.customer_id
    HAVING EXTRACT(YEAR FROM AGE(NOW(), MIN(b.scheduled_at))) = p_years_ago
        AND EXTRACT(DAY FROM AGE(NOW(), MIN(b.scheduled_at))) BETWEEN 0 AND 7; -- Within 7 days of anniversary
END;
$$ LANGUAGE plpgsql;

-- Function to get active clients (for seasonal/holiday promotions)
CREATE OR REPLACE FUNCTION get_active_clients(
    p_provider_id UUID,
    p_days INTEGER
)
RETURNS TABLE (
    id UUID,
    last_booking_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        b.customer_id as id,
        MAX(b.scheduled_at) as last_booking_date
    FROM bookings b
    WHERE b.provider_id = p_provider_id
        AND b.status IN ('completed', 'confirmed')
        AND b.scheduled_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY b.customer_id;
END;
$$ LANGUAGE plpgsql;
