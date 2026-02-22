-- Beautonomi Database Migration
-- 092_feature_flags_and_permissions.sql
-- Feature flags and permissions system for superadmin control

-- Feature flags table - allows superadmins to enable/disable features
CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_key TEXT NOT NULL UNIQUE,
    feature_name TEXT NOT NULL,
    description TEXT,
    enabled BOOLEAN NOT NULL DEFAULT false,
    category TEXT, -- e.g., 'booking', 'payment', 'notifications', 'reports', etc.
    metadata JSONB DEFAULT '{}'::jsonb, -- Additional configuration for the feature
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id)
);

-- Indexes for feature flags
CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON feature_flags(feature_key);
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON feature_flags(enabled);
CREATE INDEX IF NOT EXISTS idx_feature_flags_category ON feature_flags(category);

-- Permissions table - defines what actions users can perform
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    permission_key TEXT NOT NULL UNIQUE,
    permission_name TEXT NOT NULL,
    description TEXT,
    resource_type TEXT, -- e.g., 'booking', 'provider', 'user', 'admin', etc.
    action TEXT, -- e.g., 'create', 'read', 'update', 'delete', 'manage'
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for permissions
CREATE INDEX IF NOT EXISTS idx_permissions_key ON permissions(permission_key);
CREATE INDEX IF NOT EXISTS idx_permissions_resource ON permissions(resource_type);
CREATE INDEX IF NOT EXISTS idx_permissions_enabled ON permissions(enabled);

-- Role permissions junction table - links roles to permissions
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role TEXT NOT NULL, -- e.g., 'superadmin', 'admin', 'provider', 'user'
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(role, permission_id)
);

-- Indexes for role permissions
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON role_permissions(permission_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to update updated_at
CREATE TRIGGER update_feature_flags_updated_at
    BEFORE UPDATE ON feature_flags
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_permissions_updated_at
    BEFORE UPDATE ON permissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies for feature_flags
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- Policy: Only superadmins can view feature flags
CREATE POLICY "Superadmins can view feature flags"
    ON feature_flags FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'superadmin'
        )
    );

-- Policy: Only superadmins can insert feature flags
CREATE POLICY "Superadmins can insert feature flags"
    ON feature_flags FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'superadmin'
        )
    );

-- Policy: Only superadmins can update feature flags
CREATE POLICY "Superadmins can update feature flags"
    ON feature_flags FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'superadmin'
        )
    );

-- Policy: Only superadmins can delete feature flags
CREATE POLICY "Superadmins can delete feature flags"
    ON feature_flags FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'superadmin'
        )
    );

-- RLS Policies for permissions
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

-- Policy: Superadmins can view all permissions
CREATE POLICY "Superadmins can view permissions"
    ON permissions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'superadmin'
        )
    );

-- Policy: Superadmins can manage permissions
CREATE POLICY "Superadmins can manage permissions"
    ON permissions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'superadmin'
        )
    );

-- RLS Policies for role_permissions
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Policy: Superadmins can view role permissions
CREATE POLICY "Superadmins can view role permissions"
    ON role_permissions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'superadmin'
        )
    );

-- Policy: Superadmins can manage role permissions
CREATE POLICY "Superadmins can manage role permissions"
    ON role_permissions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'superadmin'
        )
    );

-- Insert default feature flags
INSERT INTO feature_flags (feature_key, feature_name, description, enabled, category) VALUES
    ('booking_online', 'Online Booking', 'Allow customers to book services online', true, 'booking'),
    ('booking_at_home', 'At-Home Services', 'Enable booking of at-home services', true, 'booking'),
    ('booking_group', 'Group Bookings', 'Allow group bookings for services', true, 'booking'),
    ('payment_stripe', 'Stripe Payments', 'Enable Stripe payment processing', true, 'payment'),
    ('payment_wallet', 'Wallet Payments', 'Enable wallet/purse payment method', true, 'payment'),
    ('notifications_email', 'Email Notifications', 'Send email notifications to users', true, 'notifications'),
    ('notifications_sms', 'SMS Notifications', 'Send SMS notifications to users', false, 'notifications'),
    ('notifications_push', 'Push Notifications', 'Send push notifications to users', true, 'notifications'),
    ('reports_export', 'Export Reports', 'Allow exporting of reports in various formats', true, 'reports'),
    ('reports_analytics', 'Analytics Reports', 'Enable advanced analytics and reporting', true, 'reports'),
    ('provider_verification', 'Provider Verification', 'Require verification for providers', true, 'provider'),
    ('staff_time_tracking', 'Staff Time Tracking', 'Enable time clock functionality for staff', true, 'staff'),
    ('loyalty_program', 'Loyalty Program', 'Enable loyalty points and rewards system', true, 'loyalty'),
    ('referral_program', 'Referral Program', 'Enable referral rewards program', true, 'referral'),
    ('gift_cards', 'Gift Cards', 'Enable gift card purchases and redemption', true, 'gift_cards'),
    ('reviews_ratings', 'Reviews & Ratings', 'Allow customers to leave reviews and ratings', true, 'reviews'),
    ('qr_codes', 'QR Codes', 'Generate QR codes for bookings and services', true, 'qr_codes'),
    ('waitlist', 'Waitlist', 'Enable waitlist functionality for fully booked services', true, 'waitlist'),
    ('freelancer_mode', 'Freelancer Mode', 'Allow providers to operate as freelancers', true, 'provider'),
    ('ondemand_services', 'On-Demand Services', 'Enable on-demand service booking', true, 'booking')
ON CONFLICT (feature_key) DO NOTHING;

-- Insert default permissions
INSERT INTO permissions (permission_key, permission_name, description, resource_type, action) VALUES
    ('admin:full_access', 'Full Admin Access', 'Complete access to all admin features', 'admin', 'manage'),
    ('admin:view_dashboard', 'View Admin Dashboard', 'Access to admin dashboard', 'admin', 'read'),
    ('admin:manage_users', 'Manage Users', 'Create, update, and delete users', 'user', 'manage'),
    ('admin:manage_providers', 'Manage Providers', 'Approve, reject, and manage providers', 'provider', 'manage'),
    ('admin:manage_bookings', 'Manage Bookings', 'View and manage all bookings', 'booking', 'manage'),
    ('admin:manage_settings', 'Manage Settings', 'Modify system settings', 'admin', 'update'),
    ('admin:manage_feature_flags', 'Manage Feature Flags', 'Enable/disable features', 'admin', 'manage'),
    ('admin:view_reports', 'View Reports', 'Access to reports and analytics', 'reports', 'read'),
    ('admin:manage_finance', 'Manage Finance', 'Access to financial data and payouts', 'finance', 'manage'),
    ('provider:manage_services', 'Manage Services', 'Create and manage services', 'service', 'manage'),
    ('provider:manage_staff', 'Manage Staff', 'Add and manage staff members', 'staff', 'manage'),
    ('provider:view_bookings', 'View Bookings', 'View bookings for own provider', 'booking', 'read'),
    ('user:create_booking', 'Create Booking', 'Book services', 'booking', 'create'),
    ('user:manage_profile', 'Manage Profile', 'Update own profile', 'user', 'update')
ON CONFLICT (permission_key) DO NOTHING;

-- Grant superadmin all permissions
INSERT INTO role_permissions (role, permission_id, granted)
SELECT 
    'superadmin',
    id,
    true
FROM permissions
ON CONFLICT (role, permission_id) DO NOTHING;

-- Function to check if a feature is enabled
CREATE OR REPLACE FUNCTION is_feature_enabled(feature_key_param TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    feature_enabled BOOLEAN;
BEGIN
    SELECT enabled INTO feature_enabled
    FROM feature_flags
    WHERE feature_key = feature_key_param;
    
    RETURN COALESCE(feature_enabled, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has permission
CREATE OR REPLACE FUNCTION has_permission(user_role TEXT, permission_key_param TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    has_perm BOOLEAN;
BEGIN
    SELECT COALESCE(rp.granted, false) INTO has_perm
    FROM permissions p
    LEFT JOIN role_permissions rp ON rp.permission_id = p.id AND rp.role = user_role
    WHERE p.permission_key = permission_key_param
    AND p.enabled = true;
    
    RETURN COALESCE(has_perm, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
