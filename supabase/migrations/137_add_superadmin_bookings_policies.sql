-- Migration: Add complete superadmin RLS policies for bookings
-- This adds INSERT, UPDATE, and DELETE policies for superadmins on bookings table
-- Previously only SELECT policy existed for superadmins

-- Add superadmin INSERT policy for bookings
CREATE POLICY "Superadmins can create bookings"
    ON bookings FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Add superadmin UPDATE policy for bookings
CREATE POLICY "Superadmins can update all bookings"
    ON bookings FOR UPDATE
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

-- Add superadmin DELETE policy for bookings
CREATE POLICY "Superadmins can delete bookings"
    ON bookings FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Add comment documenting the complete superadmin access
COMMENT ON TABLE bookings IS 'Booking records with full superadmin access (SELECT, INSERT, UPDATE, DELETE)';
