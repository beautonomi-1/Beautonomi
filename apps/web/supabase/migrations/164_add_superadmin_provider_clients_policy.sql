-- Beautonomi Database Migration
-- 164_add_superadmin_provider_clients_policy.sql
-- Adds superadmin RLS policy for provider_clients table

-- Add superadmin policy for provider_clients
DROP POLICY IF EXISTS "Superadmins can manage all provider clients" ON provider_clients;
CREATE POLICY "Superadmins can manage all provider clients"
    ON provider_clients FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );
