-- Beautonomi Database Migration
-- 128_staff_permissions_and_roles.sql
-- Adds permissions column to provider_staff and creates provider_roles table

-- Step 1: Add permissions column to provider_staff
ALTER TABLE provider_staff 
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;

-- Step 2: Create index for permission queries
CREATE INDEX IF NOT EXISTS idx_provider_staff_permissions 
ON provider_staff USING GIN (permissions);

-- Step 3: Create provider_roles table for custom roles
CREATE TABLE IF NOT EXISTS provider_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    is_system_role BOOLEAN DEFAULT false, -- For owner/manager/employee defaults
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(provider_id, name)
);

-- Step 4: Add role_id to provider_staff (for custom role assignment)
ALTER TABLE provider_staff 
ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES provider_roles(id) ON DELETE SET NULL;

-- Step 5: Create indexes for provider_roles
CREATE INDEX IF NOT EXISTS idx_provider_roles_provider ON provider_roles(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_roles_active ON provider_roles(is_active);
CREATE INDEX IF NOT EXISTS idx_provider_roles_permissions ON provider_roles USING GIN (permissions);

-- Step 6: Create index for role_id in provider_staff
CREATE INDEX IF NOT EXISTS idx_provider_staff_role_id ON provider_staff(role_id);

-- Step 7: Add trigger for updated_at on provider_roles
DROP TRIGGER IF EXISTS update_provider_roles_updated_at ON provider_roles;
CREATE TRIGGER update_provider_roles_updated_at
    BEFORE UPDATE ON provider_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Step 8: Enable RLS on provider_roles
ALTER TABLE provider_roles ENABLE ROW LEVEL SECURITY;

-- Step 9: RLS Policies for provider_roles
DROP POLICY IF EXISTS "Providers can view their own roles" ON provider_roles;
CREATE POLICY "Providers can view their own roles"
    ON provider_roles FOR SELECT
    USING (
        provider_id IN (
            SELECT id FROM providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Providers can manage their own roles" ON provider_roles;
CREATE POLICY "Providers can manage their own roles"
    ON provider_roles FOR ALL
    USING (
        provider_id IN (
            SELECT id FROM providers WHERE user_id = auth.uid()
            UNION
            SELECT provider_id FROM provider_staff 
            WHERE user_id = auth.uid() 
            AND (role = 'owner' OR is_admin = true)
        )
    );

-- Step 10: Comments
COMMENT ON COLUMN provider_staff.permissions IS 'Granular permissions for staff member stored as JSONB (e.g., {"view_calendar": true, "edit_appointments": false})';
COMMENT ON COLUMN provider_staff.role_id IS 'Optional custom role assignment. If set, uses role permissions instead of direct permissions or default role permissions';
COMMENT ON TABLE provider_roles IS 'Custom roles with specific permissions for each provider. Allows creating roles like "Senior Stylist", "Receptionist", etc.';
COMMENT ON COLUMN provider_roles.permissions IS 'JSON object mapping permission IDs to boolean values (e.g., {"view_calendar": true, "edit_appointments": true})';
COMMENT ON COLUMN provider_roles.is_system_role IS 'If true, this is a system-defined role (owner/manager/employee) that cannot be deleted';

-- Step 11: Function to get default permissions for a role
CREATE OR REPLACE FUNCTION get_default_permissions_for_role(p_role TEXT)
RETURNS JSONB AS $$
BEGIN
    CASE p_role
        WHEN 'owner' THEN
            RETURN '{
                "view_calendar": true,
                "create_appointments": true,
                "edit_appointments": true,
                "cancel_appointments": true,
                "delete_appointments": true,
                "view_sales": true,
                "create_sales": true,
                "process_payments": true,
                "view_reports": true,
                "view_services": true,
                "edit_services": true,
                "view_products": true,
                "edit_products": true,
                "view_team": true,
                "manage_team": true,
                "view_settings": true,
                "edit_settings": true,
                "view_clients": true,
                "edit_clients": true
            }'::jsonb;
        WHEN 'manager' THEN
            RETURN '{
                "view_calendar": true,
                "create_appointments": true,
                "edit_appointments": true,
                "cancel_appointments": true,
                "delete_appointments": false,
                "view_sales": true,
                "create_sales": true,
                "process_payments": true,
                "view_reports": true,
                "view_services": true,
                "edit_services": true,
                "view_products": true,
                "edit_products": true,
                "view_team": true,
                "manage_team": false,
                "view_settings": true,
                "edit_settings": false,
                "view_clients": true,
                "edit_clients": true
            }'::jsonb;
        WHEN 'employee' THEN
            RETURN '{
                "view_calendar": true,
                "create_appointments": true,
                "edit_appointments": false,
                "cancel_appointments": false,
                "delete_appointments": false,
                "view_sales": true,
                "create_sales": false,
                "process_payments": false,
                "view_reports": false,
                "view_services": true,
                "edit_services": false,
                "view_products": true,
                "edit_products": false,
                "view_team": false,
                "manage_team": false,
                "view_settings": false,
                "edit_settings": false,
                "view_clients": true,
                "edit_clients": false
            }'::jsonb;
        ELSE
            RETURN '{}'::jsonb;
    END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION get_default_permissions_for_role IS 'Returns default permissions JSONB for a given role (owner/manager/employee)';
