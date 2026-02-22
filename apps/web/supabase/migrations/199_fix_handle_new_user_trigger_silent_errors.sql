-- Migration: Further improve handle_new_user trigger to be completely silent on errors
-- This ensures trigger never fails the transaction, even if Supabase Auth checks for errors

-- Drop the trigger first, then recreate the function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_full_name TEXT;
    v_phone TEXT;
    v_avatar_url TEXT;
    v_role user_role;
    v_email TEXT;
BEGIN
    -- Ensure email is never empty (use a fallback)
    v_email := COALESCE(NULLIF(TRIM(NEW.email), ''), 'user-' || NEW.id::text || '@beautonomi.local');
    
    -- Extract values with proper null handling
    v_full_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        CASE 
            WHEN NEW.raw_user_meta_data->>'first_name' IS NOT NULL OR NEW.raw_user_meta_data->>'last_name' IS NOT NULL
            THEN TRIM(COALESCE(NEW.raw_user_meta_data->>'first_name', '') || ' ' || COALESCE(NEW.raw_user_meta_data->>'last_name', ''))
            ELSE NULL
        END,
        NEW.raw_user_meta_data->>'display_name',
        NEW.raw_user_meta_data->>'preferred_username'
    );
    
    v_phone := COALESCE(
        NEW.raw_user_meta_data->>'phone',
        NEW.raw_user_meta_data->>'phone_number'
    );
    
    v_avatar_url := COALESCE(
        NEW.raw_user_meta_data->>'avatar_url',
        NEW.raw_user_meta_data->>'picture',
        NEW.raw_user_meta_data->>'photo',
        NEW.raw_user_meta_data->>'image'
    );
    
    -- Extract role from metadata, default to customer
    BEGIN
        v_role := COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'customer');
    EXCEPTION WHEN OTHERS THEN
        v_role := 'customer';
    END;
    
    -- Insert or update user profile - use ON CONFLICT to handle any conflicts silently
    BEGIN
        INSERT INTO public.users (id, email, full_name, phone, avatar_url, role)
        VALUES (
            NEW.id,
            v_email,
            v_full_name,
            v_phone,
            v_avatar_url,
            v_role
        )
        ON CONFLICT (id) DO UPDATE SET
            email = COALESCE(EXCLUDED.email, users.email, v_email),
            full_name = COALESCE(EXCLUDED.full_name, users.full_name, v_full_name),
            phone = COALESCE(EXCLUDED.phone, users.phone, v_phone),
            avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url, v_avatar_url),
            role = COALESCE(EXCLUDED.role, users.role, v_role);
    EXCEPTION WHEN OTHERS THEN
        -- Silently try to update if insert failed
        BEGIN
            UPDATE public.users
            SET 
                email = COALESCE(v_email, users.email),
                full_name = COALESCE(v_full_name, users.full_name),
                phone = COALESCE(v_phone, users.phone),
                avatar_url = COALESCE(v_avatar_url, users.avatar_url),
                role = COALESCE(v_role, users.role)
            WHERE id = NEW.id;
        EXCEPTION WHEN OTHERS THEN
            -- Completely silent - don't raise anything
            NULL;
        END;
    END;
    
    -- Create wallet for new user - completely silent on errors
    BEGIN
        INSERT INTO public.user_wallets (user_id, currency)
        VALUES (NEW.id, 'ZAR')
        ON CONFLICT (user_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        -- Completely silent - don't raise anything
        NULL;
    END;
    
    -- Always return NEW to allow auth user creation to succeed
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Catch all errors and silently return NEW
    -- This ensures the trigger never fails the transaction
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger (it was dropped above, so this will create it fresh)
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Add comment
COMMENT ON FUNCTION handle_new_user() IS 
'Creates user profile and wallet when auth user is created. Completely silent on errors to prevent blocking user creation.';
