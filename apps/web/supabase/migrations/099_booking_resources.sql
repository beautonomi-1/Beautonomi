-- Beautonomi Database Migration
-- 099_booking_resources.sql
-- Creates booking_resources table to link bookings to required resources

-- Booking Resources table
-- Links bookings to resources (rooms, equipment, etc.) that are required for the service
CREATE TABLE IF NOT EXISTS public.booking_resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    booking_service_id UUID REFERENCES booking_services(id) ON DELETE CASCADE,
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    scheduled_start_at TIMESTAMP WITH TIME ZONE NOT NULL,
    scheduled_end_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- One resource can only be booked once per time slot
    -- This constraint prevents double-booking of resources
    UNIQUE(resource_id, scheduled_start_at, scheduled_end_at)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_booking_resources_booking ON booking_resources(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_resources_service ON booking_resources(booking_service_id);
CREATE INDEX IF NOT EXISTS idx_booking_resources_resource ON booking_resources(resource_id);
CREATE INDEX IF NOT EXISTS idx_booking_resources_time ON booking_resources(scheduled_start_at, scheduled_end_at);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_booking_resources_updated_at ON booking_resources;
CREATE TRIGGER update_booking_resources_updated_at BEFORE UPDATE ON booking_resources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE booking_resources ENABLE ROW LEVEL SECURITY;

-- RLS Policies for booking_resources
DROP POLICY IF EXISTS "Providers can view resources for own bookings" ON booking_resources;
CREATE POLICY "Providers can view resources for own bookings"
    ON booking_resources FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            JOIN providers ON providers.id = bookings.provider_id
            WHERE bookings.id = booking_resources.booking_id
            AND providers.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Customers can view resources for own bookings" ON booking_resources;
CREATE POLICY "Customers can view resources for own bookings"
    ON booking_resources FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = booking_resources.booking_id
            AND bookings.customer_id = auth.uid()
        )
    );

-- Function to check resource availability
CREATE OR REPLACE FUNCTION check_resource_availability(
    p_resource_id UUID,
    p_start_at TIMESTAMP WITH TIME ZONE,
    p_end_at TIMESTAMP WITH TIME ZONE,
    p_exclude_booking_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_conflict_count INTEGER;
BEGIN
    -- Check for overlapping bookings
    SELECT COUNT(*) INTO v_conflict_count
    FROM booking_resources
    WHERE resource_id = p_resource_id
    AND scheduled_start_at < p_end_at
    AND scheduled_end_at > p_start_at
    AND (p_exclude_booking_id IS NULL OR booking_id != p_exclude_booking_id)
    AND EXISTS (
        SELECT 1 FROM bookings
        WHERE bookings.id = booking_resources.booking_id
        AND bookings.status != 'cancelled'
    );

    -- Return true if no conflicts (resource is available)
    RETURN v_conflict_count = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
