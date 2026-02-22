-- Beautonomi Database Migration
-- 157_add_superadmin_resources_policy.sql
-- Adds superadmin policy for resources

-- Add superadmin policy for resources
DROP POLICY IF EXISTS "Superadmins can manage all resources" ON resources;
CREATE POLICY "Superadmins can manage all resources"
    ON resources FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );
