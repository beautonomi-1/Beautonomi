-- 972: Harden handle_new_user for GoTrue (supabase_auth_admin) — explicit search_path and qualified types.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_currency TEXT;
BEGIN
    INSERT INTO public.users (id, email, full_name, phone, avatar_url, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
            NEW.raw_user_meta_data->>'full_name',
            NEW.raw_user_meta_data->>'name',
            (NEW.raw_user_meta_data->>'first_name' || ' ' || NEW.raw_user_meta_data->>'last_name'),
            NEW.raw_user_meta_data->>'display_name',
            NEW.raw_user_meta_data->>'preferred_username'
        ),
        COALESCE(
            NEW.raw_user_meta_data->>'phone',
            NEW.raw_user_meta_data->>'phone_number'
        ),
        COALESCE(
            NEW.raw_user_meta_data->>'avatar_url',
            NEW.raw_user_meta_data->>'picture',
            NEW.raw_user_meta_data->>'photo',
            NEW.raw_user_meta_data->>'image'
        ),
        COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'customer'::public.user_role)
    )
    ON CONFLICT (id) DO UPDATE SET
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

    v_wallet_currency := upper(trim(COALESCE(NEW.raw_user_meta_data->>'currency', '')));
    IF v_wallet_currency = '' OR length(v_wallet_currency) <> 3 THEN
      v_wallet_currency := 'ZAR';
    END IF;

    INSERT INTO public.user_wallets (user_id, currency)
    VALUES (NEW.id, v_wallet_currency)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Auth signup trigger: public.users row + wallet; search_path=public for GoTrue compatibility.';
