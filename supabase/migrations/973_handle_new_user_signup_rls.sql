-- 973: Restore signup RLS policies (dropped in 049) and never fail auth.users INSERT from handle_new_user.

DROP POLICY IF EXISTS "Allow trigger to insert user profiles" ON public.users;
DROP POLICY IF EXISTS "Allow trigger to insert user wallets" ON public.user_wallets;

CREATE POLICY "Allow trigger to insert user profiles"
    ON public.users FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = users.id
        )
    );

CREATE POLICY "Allow trigger to insert user wallets"
    ON public.user_wallets FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = user_wallets.user_id
        )
    );

GRANT INSERT ON public.users TO service_role;
GRANT INSERT ON public.user_wallets TO service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_currency TEXT;
BEGIN
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
            full_name = COALESCE(EXCLUDED.full_name, users.full_name),
            phone = COALESCE(EXCLUDED.phone, users.phone),
            avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'handle_new_user users insert: %', SQLERRM;
    END;

    v_wallet_currency := upper(trim(COALESCE(NEW.raw_user_meta_data->>'currency', '')));
    IF v_wallet_currency = '' OR length(v_wallet_currency) <> 3 THEN
      v_wallet_currency := 'ZAR';
    END IF;

    BEGIN
        INSERT INTO public.user_wallets (user_id, currency)
        VALUES (NEW.id, v_wallet_currency)
        ON CONFLICT (user_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'handle_new_user wallet insert: %', SQLERRM;
    END;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Auth signup trigger; RLS-safe inserts with non-fatal warnings on public.users/wallets.';
