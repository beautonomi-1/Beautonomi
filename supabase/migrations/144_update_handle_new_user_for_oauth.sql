-- Migration: Update handle_new_user function to extract OAuth metadata
-- This ensures social signups populate the customer profile with name, avatar, and phone

-- Update the function to extract avatar_url and handle OAuth metadata better
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name, phone, avatar_url, role)
    VALUES (
        NEW.id,
        NEW.email,
        -- Extract name from various OAuth providers and metadata formats
        COALESCE(
            NEW.raw_user_meta_data->>'full_name',
            NEW.raw_user_meta_data->>'name',
            (NEW.raw_user_meta_data->>'first_name' || ' ' || NEW.raw_user_meta_data->>'last_name'),
            NEW.raw_user_meta_data->>'display_name',
            NEW.raw_user_meta_data->>'preferred_username'
        ),
        -- Extract phone from metadata
        COALESCE(
            NEW.raw_user_meta_data->>'phone',
            NEW.raw_user_meta_data->>'phone_number'
        ),
        -- Extract avatar from OAuth providers (Google, Apple, Facebook use different field names)
        COALESCE(
            NEW.raw_user_meta_data->>'avatar_url',
            NEW.raw_user_meta_data->>'picture',
            NEW.raw_user_meta_data->>'photo',
            NEW.raw_user_meta_data->>'image'
        ),
        -- Extract role from metadata, default to customer
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'customer')
    )
    ON CONFLICT (id) DO UPDATE SET
        -- Update existing profile if OAuth data is more complete
        full_name = COALESCE(
            EXCLUDED.full_name,
            users.full_name,
            COALESCE(
                NEW.raw_user_meta_data->>'full_name',
                NEW.raw_user_meta_data->>'name',
                (NEW.raw_user_meta_data->>'first_name' || ' ' || NEW.raw_user_meta_data->>'last_name'),
                NEW.raw_user_meta_data->>'display_name',
                NEW.raw_user_meta_data->>'preferred_username'
            )
        ),
        phone = COALESCE(
            EXCLUDED.phone,
            users.phone,
            COALESCE(
                NEW.raw_user_meta_data->>'phone',
                NEW.raw_user_meta_data->>'phone_number'
            )
        ),
        avatar_url = COALESCE(
            EXCLUDED.avatar_url,
            users.avatar_url,
            COALESCE(
                NEW.raw_user_meta_data->>'avatar_url',
                NEW.raw_user_meta_data->>'picture',
                NEW.raw_user_meta_data->>'photo',
                NEW.raw_user_meta_data->>'image'
            )
        );
    
    -- Create wallet for new user (only if it doesn't exist)
    INSERT INTO public.user_wallets (user_id, currency)
    VALUES (NEW.id, 'ZAR')
    ON CONFLICT (user_id) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
