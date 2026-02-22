-- Add RLS policy for superadmins to manage all service zones
CREATE POLICY "Superadmins can manage all service zones"
    ON service_zones FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );
