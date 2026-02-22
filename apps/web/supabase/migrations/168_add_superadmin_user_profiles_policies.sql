-- Add superadmin UPDATE and INSERT policies for user_profiles
-- This allows superadmins to update notification preferences and other profile data for any user

-- Add superadmin UPDATE policy for user_profiles
DROP POLICY IF EXISTS "Superadmins can update all profile data" ON user_profiles;
CREATE POLICY "Superadmins can update all profile data"
    ON user_profiles FOR UPDATE
    USING (is_superadmin());

-- Add superadmin INSERT policy for user_profiles
DROP POLICY IF EXISTS "Superadmins can insert profile data" ON user_profiles;
CREATE POLICY "Superadmins can insert profile data"
    ON user_profiles FOR INSERT
    WITH CHECK (is_superadmin());

COMMENT ON POLICY "Superadmins can update all profile data" ON user_profiles IS 'Allows superadmins to update any user profile data, including notification preferences';
COMMENT ON POLICY "Superadmins can insert profile data" ON user_profiles IS 'Allows superadmins to insert profile data for any user';
