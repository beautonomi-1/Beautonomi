-- Migration: Fix handle_new_user trigger to be more robust and handle errors gracefully
-- This prevents trigger failures from blocking user creation

-- Update the function to handle errors gracefully and ensure it doesn't fail the transaction
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_full_name TEXT;
    v_phone TEXT;
    v_avatar_url TEXT;
    v_role user_role;
BEGIN
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
    
    -- Insert or update user profile with ON CONFLICT handling
    -- Wrap in exception handling to prevent failures
    BEGIN
        INSERT INTO public.users (id, email, full_name, phone, avatar_url, role)
        VALUES (
            NEW.id,
            COALESCE(NEW.email, ''),
            v_full_name,
            v_phone,
            v_avatar_url,
            v_role
        )
        ON CONFLICT (id) DO UPDATE SET
            -- Update existing profile if OAuth data is more complete
            full_name = COALESCE(
                EXCLUDED.full_name,
                users.full_name,
                v_full_name
            ),
            phone = COALESCE(
                EXCLUDED.phone,
                users.phone,
                v_phone
            ),
            avatar_url = COALESCE(
                EXCLUDED.avatar_url,
                users.avatar_url,
                v_avatar_url
            ),
            email = COALESCE(EXCLUDED.email, users.email);
    EXCEPTION WHEN OTHERS THEN
        -- If insert fails, try to update existing record
        BEGIN
            UPDATE public.users
            SET 
                email = COALESCE(NEW.email, users.email),
                full_name = COALESCE(v_full_name, users.full_name),
                phone = COALESCE(v_phone, users.phone),
                avatar_url = COALESCE(v_avatar_url, users.avatar_url),
                role = COALESCE(v_role, users.role)
            WHERE id = NEW.id;
            
            -- If update also fails or no rows affected, log warning
            IF NOT FOUND THEN
                RAISE WARNING 'Could not create or update user profile for user %: %', NEW.id, SQLERRM;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed to create or update user profile for user %: %', NEW.id, SQLERRM;
        END;
    END;
    
    -- Create wallet for new user (only if it doesn't exist)
    -- Wrap in exception handling so wallet creation failure doesn't break user creation
    BEGIN
        INSERT INTO public.user_wallets (user_id, currency)
        VALUES (NEW.id, 'ZAR')
        ON CONFLICT (user_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        -- Log the error but don't fail the transaction
        RAISE WARNING 'Failed to create wallet for user %: %', NEW.id, SQLERRM;
    END;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log the error but allow the transaction to continue
    -- This prevents trigger failures from blocking auth user creation
    RAISE WARNING 'Error in handle_new_user trigger for user %: %', NEW.id, SQLERRM;
    -- Still return NEW to allow the auth user creation to succeed
    -- The user profile can be created manually later if needed
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment explaining the error handling
COMMENT ON FUNCTION handle_new_user() IS 
'Creates user profile and wallet when auth user is created. Uses exception handling to prevent trigger failures from blocking user creation.';
