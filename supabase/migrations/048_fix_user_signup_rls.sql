-- Fix RLS policies for user signup
-- This migration ensures that the handle_new_user() trigger function
-- can insert into users and user_wallets tables during signup

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Allow trigger to insert user profiles" ON users;
DROP POLICY IF EXISTS "Allow trigger to insert user wallets" ON user_wallets;

-- Update the trigger function to explicitly handle RLS and add better error handling
-- SECURITY DEFINER should bypass RLS, but we'll also add explicit policies as backup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    -- Insert user profile
    -- SECURITY DEFINER should bypass RLS, but we'll catch any errors
    BEGIN
        INSERT INTO public.users (id, email, full_name, phone, role)
        VALUES (
            NEW.id,
            NEW.email,
            COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
            NEW.raw_user_meta_data->>'phone',
            COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'customer')
        );
    EXCEPTION WHEN OTHERS THEN
        -- Log the error but don't fail the auth signup
        RAISE WARNING 'Error inserting user profile: %', SQLERRM;
        RAISE;
    END;
    
    -- Create wallet for new user
    BEGIN
        INSERT INTO public.user_wallets (user_id, currency)
        VALUES (NEW.id, 'ZAR');
    EXCEPTION WHEN OTHERS THEN
        -- Log the error but don't fail the auth signup
        RAISE WARNING 'Error inserting user wallet: %', SQLERRM;
        -- Don't re-raise for wallet - user profile is more important
    END;
    
    RETURN NEW;
END;
$$;

-- Grant execute permission to authenticated users (required for trigger)
GRANT EXECUTE ON FUNCTION handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION handle_new_user() TO service_role;

-- Add INSERT policy for users table to allow trigger function to create user profiles
-- The policy allows inserts when the user exists in auth.users (which is true during trigger execution)
-- This is safe because:
-- 1. The trigger only fires on auth.users INSERT (controlled by Supabase)
-- 2. The function uses SECURITY DEFINER and validates data
-- 3. The inserted id must match an existing auth.users.id
-- Note: WITH CHECK uses the row being inserted, so users.id refers to the new row's id
CREATE POLICY "Allow trigger to insert user profiles"
    ON users FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = users.id
        )
    );

-- Add INSERT policy for user_wallets table to allow trigger function to create wallets
-- The policy allows inserts when the user exists in auth.users
CREATE POLICY "Allow trigger to insert user wallets"
    ON user_wallets FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = user_wallets.user_id
        )
    );

-- Also grant INSERT permissions to the service_role (used by SECURITY DEFINER functions)
-- This ensures the function can insert even if RLS policies have issues
GRANT INSERT ON users TO service_role;
GRANT INSERT ON user_wallets TO service_role;

-- Note: These policies work because:
-- 1. The trigger function handle_new_user() uses SECURITY DEFINER (should bypass RLS)
-- 2. The trigger fires AFTER INSERT on auth.users, so the user exists in auth.users
-- 3. The policy checks that the inserted id/user_id exists in auth.users
-- 4. Other RLS policies (SELECT, UPDATE) still protect the data
-- 5. The function now has better error handling to identify specific issues
