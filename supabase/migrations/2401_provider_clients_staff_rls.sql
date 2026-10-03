-- Beautonomi Database Migration
-- 240_provider_clients_staff_rls.sql
-- Allow active staff members to access provider_clients (not just the owner)

-- SELECT: owners + all active staff
DROP POLICY IF EXISTS "Providers can view own clients" ON provider_clients;
CREATE POLICY "Providers can view own clients"
    ON provider_clients FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_clients.provider_id
            AND providers.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM provider_staff
            WHERE provider_staff.provider_id = provider_clients.provider_id
            AND provider_staff.user_id = auth.uid()
            AND provider_staff.is_active = true
        )
    );

-- INSERT: owners + managers
DROP POLICY IF EXISTS "Providers can create own clients" ON provider_clients;
CREATE POLICY "Providers can create own clients"
    ON provider_clients FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_clients.provider_id
            AND providers.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM provider_staff
            WHERE provider_staff.provider_id = provider_clients.provider_id
            AND provider_staff.user_id = auth.uid()
            AND provider_staff.is_active = true
            AND provider_staff.role IN ('owner', 'manager')
        )
    );

-- UPDATE: owners + managers
DROP POLICY IF EXISTS "Providers can update own clients" ON provider_clients;
CREATE POLICY "Providers can update own clients"
    ON provider_clients FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_clients.provider_id
            AND providers.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM provider_staff
            WHERE provider_staff.provider_id = provider_clients.provider_id
            AND provider_staff.user_id = auth.uid()
            AND provider_staff.is_active = true
            AND provider_staff.role IN ('owner', 'manager')
        )
    );

-- DELETE: owners only (+ managers)
DROP POLICY IF EXISTS "Providers can delete own clients" ON provider_clients;
CREATE POLICY "Providers can delete own clients"
    ON provider_clients FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM providers
            WHERE providers.id = provider_clients.provider_id
            AND providers.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM provider_staff
            WHERE provider_staff.provider_id = provider_clients.provider_id
            AND provider_staff.user_id = auth.uid()
            AND provider_staff.is_active = true
            AND provider_staff.role IN ('owner', 'manager')
        )
    );
