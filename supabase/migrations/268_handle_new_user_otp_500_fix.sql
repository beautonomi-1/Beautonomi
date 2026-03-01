-- Fix 500 on auth/v1/otp: ensure handle_new_user never fails the auth transaction.
-- Supabase returns 500 when any trigger on auth.users raises; this migration
-- sets search_path and wraps all logic so no error can escape.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_full_name TEXT;
    v_phone TEXT;
    v_avatar_url TEXT;
    v_role user_role;
    v_email TEXT;
    v_meta JSONB;
BEGIN
    -- Guard: ensure we never raise out of this function (auth transaction must succeed)
    v_meta := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);

    v_email := COALESCE(NULLIF(TRIM(NEW.email), ''), 'user-' || NEW.id::text || '@beautonomi.local');

    v_full_name := COALESCE(
        v_meta->>'full_name',
        v_meta->>'name',
        CASE
            WHEN (v_meta->>'first_name') IS NOT NULL OR (v_meta->>'last_name') IS NOT NULL
            THEN TRIM(COALESCE(v_meta->>'first_name', '') || ' ' || COALESCE(v_meta->>'last_name', ''))
            ELSE NULL
        END,
        v_meta->>'display_name',
        v_meta->>'preferred_username'
    );

    v_phone := COALESCE(v_meta->>'phone', v_meta->>'phone_number');
    v_avatar_url := COALESCE(v_meta->>'avatar_url', v_meta->>'picture', v_meta->>'photo', v_meta->>'image');

    BEGIN
        v_role := COALESCE((v_meta->>'role')::user_role, 'customer');
    EXCEPTION WHEN OTHERS THEN
        v_role := 'customer';
    END;

    BEGIN
        INSERT INTO public.users (id, email, full_name, phone, avatar_url, role)
        VALUES (NEW.id, v_email, v_full_name, v_phone, v_avatar_url, v_role)
        ON CONFLICT (id) DO UPDATE SET
            email = COALESCE(EXCLUDED.email, users.email, v_email),
            full_name = COALESCE(EXCLUDED.full_name, users.full_name, v_full_name),
            phone = COALESCE(EXCLUDED.phone, users.phone, v_phone),
            avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url, v_avatar_url),
            role = COALESCE(EXCLUDED.role, users.role, v_role);
    EXCEPTION WHEN OTHERS THEN
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
            NULL;
        END;
    END;

    BEGIN
        INSERT INTO public.user_wallets (user_id, currency)
        VALUES (NEW.id, 'ZAR')
        ON CONFLICT (user_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

COMMENT ON FUNCTION handle_new_user() IS
'Creates user profile and wallet on auth signup. Never raises so auth/v1/otp and signup never get 500.';
