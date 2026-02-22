-- Fix infinite recursion in providers RLS policies
-- The issue is that provider policies check provider_staff which checks providers
-- And superadmin check queries users which might have policies that cause recursion

-- Create a helper function to check if user owns a provider (bypasses RLS)
CREATE OR REPLACE FUNCTION is_provider_owner(provider_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM providers p
        WHERE p.id = provider_id
        AND p.user_id = auth.uid()
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$;

-- Create a helper function to get current user's provider ID (bypasses RLS)
CREATE OR REPLACE FUNCTION get_user_provider_id()
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_provider_id UUID;
BEGIN
    SELECT id INTO v_provider_id
    FROM providers
    WHERE user_id = auth.uid()
    LIMIT 1;
    
    RETURN v_provider_id;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$;

-- Create a helper function to check if user is staff of a provider (bypasses RLS)
CREATE OR REPLACE FUNCTION is_provider_staff(provider_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM provider_staff ps
        WHERE ps.provider_id = provider_id
        AND ps.user_id = auth.uid()
        AND ps.is_active = true
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$;

-- Create a helper function to check if user can access a provider (owner or staff)
CREATE OR REPLACE FUNCTION can_access_provider(provider_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN is_provider_owner(provider_id) OR is_provider_staff(provider_id);
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$;

-- Drop existing problematic policies on providers
DROP POLICY IF EXISTS "Public can view active providers" ON providers;
DROP POLICY IF EXISTS "Providers can view own profile" ON providers;
DROP POLICY IF EXISTS "Providers can update own profile" ON providers;
DROP POLICY IF EXISTS "Superadmins can manage all providers" ON providers;
DROP POLICY IF EXISTS "Staff can view provider profile" ON providers;

-- Recreate policies using helper functions to avoid recursion
-- Policy 1: Public can view active providers
CREATE POLICY "Public can view active providers"
    ON providers FOR SELECT
    USING (status = 'active');

-- Policy 2: Providers can view their own profile (including non-active status)
CREATE POLICY "Providers can view own profile"
    ON providers FOR SELECT
    USING (user_id = auth.uid());

-- Policy 3: Staff can view their provider's profile
CREATE POLICY "Staff can view provider profile"
    ON providers FOR SELECT
    USING (is_provider_staff(id));

-- Policy 4: Providers can update their own profile
CREATE POLICY "Providers can update own profile"
    ON providers FOR UPDATE
    USING (user_id = auth.uid());

-- Policy 5: Superadmins can manage all providers
CREATE POLICY "Superadmins can manage all providers"
    ON providers FOR ALL
    USING (is_superadmin());

-- Now fix provider_staff policies to avoid recursion
DROP POLICY IF EXISTS "Public can view active staff of active providers" ON provider_staff;
DROP POLICY IF EXISTS "Providers can manage own staff" ON provider_staff;
DROP POLICY IF EXISTS "Staff can view own profile" ON provider_staff;
DROP POLICY IF EXISTS "Superadmins can manage all staff" ON provider_staff;

-- Recreate provider_staff policies
CREATE POLICY "Public can view active staff of active providers"
    ON provider_staff FOR SELECT
    USING (is_active = true);

CREATE POLICY "Providers can manage own staff"
    ON provider_staff FOR ALL
    USING (is_provider_owner(provider_id));

CREATE POLICY "Staff can view own profile"
    ON provider_staff FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Superadmins can manage all staff"
    ON provider_staff FOR ALL
    USING (is_superadmin());

-- Fix provider_locations policies
DROP POLICY IF EXISTS "Public can view active provider locations" ON provider_locations;
DROP POLICY IF EXISTS "Providers can manage own locations" ON provider_locations;
DROP POLICY IF EXISTS "Staff can view provider locations" ON provider_locations;
DROP POLICY IF EXISTS "Superadmins can manage all locations" ON provider_locations;

CREATE POLICY "Public can view active provider locations"
    ON provider_locations FOR SELECT
    USING (is_active = true);

CREATE POLICY "Providers can manage own locations"
    ON provider_locations FOR ALL
    USING (is_provider_owner(provider_id));

CREATE POLICY "Staff can view provider locations"
    ON provider_locations FOR SELECT
    USING (is_provider_staff(provider_id));

CREATE POLICY "Superadmins can manage all locations"
    ON provider_locations FOR ALL
    USING (is_superadmin());

-- Fix service_zones policies
DROP POLICY IF EXISTS "Providers can manage own service zones" ON service_zones;
DROP POLICY IF EXISTS "Staff can view service zones" ON service_zones;
DROP POLICY IF EXISTS "Superadmins can manage all service zones" ON service_zones;

CREATE POLICY "Providers can manage own service zones"
    ON service_zones FOR ALL
    USING (is_provider_owner(provider_id));

CREATE POLICY "Staff can view service zones"
    ON service_zones FOR SELECT
    USING (is_provider_staff(provider_id));

CREATE POLICY "Superadmins can manage all service zones"
    ON service_zones FOR ALL
    USING (is_superadmin());

-- Fix provider_subscriptions policies
DROP POLICY IF EXISTS "Providers can view own subscription" ON provider_subscriptions;
DROP POLICY IF EXISTS "Staff can view provider subscription" ON provider_subscriptions;
DROP POLICY IF EXISTS "Superadmins can manage all subscriptions" ON provider_subscriptions;

CREATE POLICY "Providers can view own subscription"
    ON provider_subscriptions FOR SELECT
    USING (is_provider_owner(provider_id));

CREATE POLICY "Staff can view provider subscription"
    ON provider_subscriptions FOR SELECT
    USING (is_provider_staff(provider_id));

CREATE POLICY "Superadmins can manage all subscriptions"
    ON provider_subscriptions FOR ALL
    USING (is_superadmin());

-- Grant execute permissions on new helper functions
GRANT EXECUTE ON FUNCTION is_provider_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_provider_owner(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_user_provider_id() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_provider_id() TO service_role;
GRANT EXECUTE ON FUNCTION is_provider_staff(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_provider_staff(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION can_access_provider(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_access_provider(UUID) TO service_role;
