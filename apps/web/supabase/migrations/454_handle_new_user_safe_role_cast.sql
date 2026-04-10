-- Migration 454: safe role cast in handle_new_user
-- Invalid raw_user_meta_data.role (typo, wrong casing, or enum drift) caused auth.users INSERT to
-- fail with "Database error saving new user" — the trigger raised before the user could sign up.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role public.user_role;
BEGIN
  BEGIN
    v_role := COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'customer'::public.user_role);
  EXCEPTION
    WHEN OTHERS THEN
      v_role := 'customer'::public.user_role;
  END;

  INSERT INTO public.users (id, email, full_name, phone, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, NEW.id::text || '@phone.local'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'phone',
    v_role
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_wallets (user_id, currency)
  VALUES (NEW.id, 'ZAR')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
