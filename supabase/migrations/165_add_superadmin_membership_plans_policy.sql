-- Beautonomi Database Migration
-- 165_add_superadmin_membership_plans_policy.sql
-- Adds superadmin RLS policy for membership_plans table

-- Add superadmin policy for membership_plans
DROP POLICY IF EXISTS "Superadmins can manage all membership plans" ON membership_plans;
CREATE POLICY "Superadmins can manage all membership plans"
    ON membership_plans FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );
