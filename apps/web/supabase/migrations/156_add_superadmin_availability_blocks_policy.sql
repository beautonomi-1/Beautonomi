-- Beautonomi Database Migration
-- 156_add_superadmin_availability_blocks_policy.sql
-- Adds superadmin policy for availability_blocks

-- Add superadmin policy for availability_blocks
DROP POLICY IF EXISTS "Superadmins can manage all availability blocks" ON availability_blocks;
CREATE POLICY "Superadmins can manage all availability blocks"
    ON availability_blocks FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );
