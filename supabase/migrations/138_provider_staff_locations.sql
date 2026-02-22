-- Migration: Add provider_staff_locations junction table
-- This allows staff members to be assigned to specific locations
-- Staff can work at multiple locations, and locations can have multiple staff

-- Create junction table
CREATE TABLE IF NOT EXISTS provider_staff_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id UUID NOT NULL REFERENCES provider_staff(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES provider_locations(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT false, -- Mark primary location for staff member
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Ensure a staff member can only have one primary location
    UNIQUE(staff_id, location_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_provider_staff_locations_staff_id ON provider_staff_locations(staff_id);
CREATE INDEX IF NOT EXISTS idx_provider_staff_locations_location_id ON provider_staff_locations(location_id);
CREATE INDEX IF NOT EXISTS idx_provider_staff_locations_primary ON provider_staff_locations(staff_id, is_primary) WHERE is_primary = true;

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_provider_staff_locations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_provider_staff_locations_updated_at
    BEFORE UPDATE ON provider_staff_locations
    FOR EACH ROW
    EXECUTE FUNCTION update_provider_staff_locations_updated_at();

-- Enable RLS
ALTER TABLE provider_staff_locations ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Providers can view staff-location assignments for their own provider
CREATE POLICY "Providers can view own staff-location assignments"
    ON provider_staff_locations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM provider_staff ps
            JOIN providers p ON p.id = ps.provider_id
            WHERE ps.id = provider_staff_locations.staff_id
            AND (
                p.user_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM provider_staff ps2
                    WHERE ps2.provider_id = p.id
                    AND ps2.user_id = auth.uid()
                )
            )
        )
    );

-- Providers can create staff-location assignments for their own provider
CREATE POLICY "Providers can create own staff-location assignments"
    ON provider_staff_locations FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM provider_staff ps
            JOIN providers p ON p.id = ps.provider_id
            WHERE ps.id = provider_staff_locations.staff_id
            AND p.user_id = auth.uid()
        )
    );

-- Providers can update staff-location assignments for their own provider
CREATE POLICY "Providers can update own staff-location assignments"
    ON provider_staff_locations FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM provider_staff ps
            JOIN providers p ON p.id = ps.provider_id
            WHERE ps.id = provider_staff_locations.staff_id
            AND p.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM provider_staff ps
            JOIN providers p ON p.id = ps.provider_id
            WHERE ps.id = provider_staff_locations.staff_id
            AND p.user_id = auth.uid()
        )
    );

-- Providers can delete staff-location assignments for their own provider
CREATE POLICY "Providers can delete own staff-location assignments"
    ON provider_staff_locations FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM provider_staff ps
            JOIN providers p ON p.id = ps.provider_id
            WHERE ps.id = provider_staff_locations.staff_id
            AND p.user_id = auth.uid()
        )
    );

-- Superadmins can do everything
CREATE POLICY "Superadmins can manage all staff-location assignments"
    ON provider_staff_locations FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Add constraint: A staff member can only have one primary location
CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_staff_locations_one_primary
    ON provider_staff_locations(staff_id)
    WHERE is_primary = true;

-- Add comment
COMMENT ON TABLE provider_staff_locations IS 'Junction table linking staff members to locations. Allows staff to work at multiple locations with one primary location.';
COMMENT ON COLUMN provider_staff_locations.is_primary IS 'Indicates if this is the primary location for the staff member. Each staff member can have only one primary location.';
