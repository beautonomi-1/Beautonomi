-- Fix infinite recursion in RLS policies
-- The issue is that policies are checking the users table, which triggers the policy check again

-- Drop the problematic INSERT policies (SECURITY DEFINER functions bypass RLS anyway)
DROP POLICY IF EXISTS "Allow trigger to insert user profiles" ON users;
DROP POLICY IF EXISTS "Allow trigger to insert user wallets" ON user_wallets;

-- Create a helper function to check if current user is superadmin
-- This function uses SECURITY DEFINER to bypass RLS and avoid recursion
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_role user_role;
BEGIN
    SELECT role INTO v_role
    FROM users
    WHERE id = auth.uid();
    
    RETURN v_role = 'superadmin';
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$;

-- Fix the superadmin policies to avoid recursion
-- Use the helper function instead of directly querying users table
DROP POLICY IF EXISTS "Superadmins can view all users" ON users;
DROP POLICY IF EXISTS "Superadmins can update all users" ON users;

-- Recreate superadmin policies using the helper function
-- This avoids recursion because the function uses SECURITY DEFINER
CREATE POLICY "Superadmins can view all users"
    ON users FOR SELECT
    USING (is_superadmin());

CREATE POLICY "Superadmins can update all users"
    ON users FOR UPDATE
    USING (is_superadmin());

-- Grant execute permission on the helper function
GRANT EXECUTE ON FUNCTION is_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_superadmin() TO service_role;

-- Note: The INSERT policies were removed because:
-- 1. SECURITY DEFINER functions bypass RLS entirely
-- 2. The handle_new_user() function uses SECURITY DEFINER
-- 3. The GRANT INSERT ON users TO service_role ensures the function can insert
-- 4. This avoids any potential recursion issues
