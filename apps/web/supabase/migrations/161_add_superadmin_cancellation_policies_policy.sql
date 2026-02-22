-- Beautonomi Database Migration
-- 161_add_superadmin_cancellation_policies_policy.sql
-- Adds superadmin policy for cancellation_policies

-- Add superadmin policy for cancellation_policies
DROP POLICY IF EXISTS "Superadmins can manage all cancellation policies" ON cancellation_policies;
CREATE POLICY "Superadmins can manage all cancellation policies"
    ON cancellation_policies FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );
