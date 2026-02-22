-- Beautonomi Database Migration
-- 097_group_bookings.sql
-- Creates group bookings and booking participants tables

-- Group Bookings table
-- A group booking is a collection of linked individual bookings
CREATE TABLE IF NOT EXISTS public.group_bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    primary_contact_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    -- Primary contact is the person who created the group booking
    -- They can reschedule the entire group
    ref_number TEXT UNIQUE, -- Group booking reference number
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Index for fast lookups
    CONSTRAINT group_bookings_ref_number_unique UNIQUE (ref_number)
);

-- Booking Participants table
-- Links individual bookings to group bookings
CREATE TABLE IF NOT EXISTS public.booking_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    group_booking_id UUID REFERENCES group_bookings(id) ON DELETE CASCADE,
    participant_name TEXT NOT NULL, -- Display name for this participant
    participant_email TEXT,
    participant_phone TEXT,
    is_primary_contact BOOLEAN DEFAULT false, -- Primary contact can reschedule group
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- One booking can only be in one group
    UNIQUE(booking_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_group_bookings_provider ON group_bookings(provider_id);
CREATE INDEX IF NOT EXISTS idx_group_bookings_primary_contact ON group_bookings(primary_contact_booking_id);
CREATE INDEX IF NOT EXISTS idx_group_bookings_scheduled_at ON group_bookings(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_booking_participants_booking ON booking_participants(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_participants_group ON booking_participants(group_booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_participants_primary ON booking_participants(group_booking_id, is_primary_contact) WHERE is_primary_contact = true;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_group_bookings_updated_at ON group_bookings;
CREATE TRIGGER update_group_bookings_updated_at BEFORE UPDATE ON group_bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_booking_participants_updated_at ON booking_participants;
CREATE TRIGGER update_booking_participants_updated_at BEFORE UPDATE ON booking_participants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE group_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_participants ENABLE ROW LEVEL SECURITY;

-- RLS Policies for group_bookings
DROP POLICY IF EXISTS "Providers can view own group bookings" ON group_bookings;
CREATE POLICY "Providers can view own group bookings"
    ON group_bookings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = group_bookings.provider_id
            AND providers.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Providers can manage own group bookings" ON group_bookings;
CREATE POLICY "Providers can manage own group bookings"
    ON group_bookings FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = group_bookings.provider_id
            AND providers.user_id = auth.uid()
        )
    );

-- Customers can view group bookings they're part of
DROP POLICY IF EXISTS "Customers can view own group bookings" ON group_bookings;
CREATE POLICY "Customers can view own group bookings"
    ON group_bookings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM booking_participants
            JOIN bookings ON bookings.id = booking_participants.booking_id
            WHERE booking_participants.group_booking_id = group_bookings.id
            AND bookings.customer_id = auth.uid()
        )
    );

-- RLS Policies for booking_participants
DROP POLICY IF EXISTS "Providers can view participants of own group bookings" ON booking_participants;
CREATE POLICY "Providers can view participants of own group bookings"
    ON booking_participants FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM group_bookings
            JOIN providers ON providers.id = group_bookings.provider_id
            WHERE group_bookings.id = booking_participants.group_booking_id
            AND providers.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Customers can view own participant records" ON booking_participants;
CREATE POLICY "Customers can view own participant records"
    ON booking_participants FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = booking_participants.booking_id
            AND bookings.customer_id = auth.uid()
        )
    );

-- Function to generate group booking reference number
CREATE OR REPLACE FUNCTION generate_group_booking_ref()
RETURNS TEXT AS $$
DECLARE
    ref_number TEXT;
    exists_check BOOLEAN;
BEGIN
    LOOP
        -- Generate reference: GB-YYYYMMDD-HHMMSS
        ref_number := 'GB-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || TO_CHAR(NOW(), 'HH24MISS');
        
        -- Check if it exists
        SELECT EXISTS(SELECT 1 FROM group_bookings WHERE ref_number = ref_number) INTO exists_check;
        
        -- If doesn't exist, return it
        IF NOT exists_check THEN
            RETURN ref_number;
        END IF;
        
        -- Wait a bit and try again
        PERFORM pg_sleep(0.1);
    END LOOP;
END;
$$ LANGUAGE plpgsql;
