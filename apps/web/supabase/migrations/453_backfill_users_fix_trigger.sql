-- Migration 453: backfill missing public.users rows & harden handle_new_user trigger
-- Fixes authentication failure on mobile apps where some users have an auth.users row
-- but no corresponding public.users row (trigger was missing, failed, or deployed late).
-- Also fixes phone-only signups where NEW.email is NULL, violating the NOT NULL constraint.

-- 1. Backfill any auth.users that have no public.users row.
--    Default role is 'customer'. Phone-only accounts get a placeholder email derived from their ID.
INSERT INTO public.users (id, email, full_name, phone, role, created_at, updated_at)
SELECT
    au.id,
    COALESCE(au.email, au.id::text || '@phone.local') AS email,
    COALESCE(
        au.raw_user_meta_data->>'full_name',
        au.raw_user_meta_data->>'name'
    ) AS full_name,
    au.raw_user_meta_data->>'phone' AS phone,
    COALESCE(
        (au.raw_user_meta_data->>'role')::user_role,
        'customer'
    ) AS role,
    au.created_at,
    now() AS updated_at
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 2. Create a wallet for any user that is still missing one after the backfill above.
INSERT INTO public.user_wallets (user_id, currency)
SELECT id, 'ZAR'
FROM public.users
WHERE id NOT IN (SELECT user_id FROM public.user_wallets)
ON CONFLICT DO NOTHING;

-- 3. Replace handle_new_user with a hardened version that:
--    a) handles NULL email (phone-only Supabase signups)
--    b) uses ON CONFLICT DO NOTHING so duplicate inserts are safe
--    c) also creates the wallet in the same trigger
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name, phone, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.email, NEW.id::text || '@phone.local'),
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
        NEW.raw_user_meta_data->>'phone',
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'customer')
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_wallets (user_id, currency)
    VALUES (NEW.id, 'ZAR')
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
