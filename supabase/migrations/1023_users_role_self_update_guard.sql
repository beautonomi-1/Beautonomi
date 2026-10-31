-- 1023: Lock self-service role changes on public.users.
-- Requires 1022 so user_role includes provider_onboarding.
--
-- Enforced cases (see trigger + handle_new_user):
-- - Own-role change rejected for authenticated users (not service_role / superadmin editing others)
-- - service_role provider_owner update allowed
-- - superadmin changing another user allowed (is_superadmin + auth.uid() <> id)
-- - Missing JWT with auth.uid() set rejected (no bypass on empty role claim alone)
-- - Signup metadata superadmin stored as customer
-- - Signup metadata provider_owner stored as provider_owner

-- ---------------------------------------------------------------------------
-- Role from signup metadata: portal roles only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.signup_metadata_role(raw_role text)
RETURNS public.user_role
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN raw_role IN ('customer', 'provider_owner', 'provider_staff', 'provider_onboarding')
      THEN raw_role::public.user_role
    ELSE 'customer'::public.user_role
  END;
$$;

REVOKE ALL ON FUNCTION public.signup_metadata_role(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signup_metadata_role(text) TO service_role;

-- ---------------------------------------------------------------------------
-- BEFORE UPDATE OF role: block self-elevation; allow service_role + superadmin-on-others
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_users_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role IS NOT DISTINCT FROM NEW.role THEN
    RETURN NEW;
  END IF;

  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_superadmin() AND auth.uid() IS DISTINCT FROM NEW.id THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'users.role cannot be changed by this session'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_users_role_update() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_users_role_update ON public.users;
CREATE TRIGGER trg_guard_users_role_update
  BEFORE UPDATE OF role ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_users_role_update();

-- ---------------------------------------------------------------------------
-- handle_new_user: ignore privileged roles from client-controlled metadata
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_currency TEXT;
  v_role public.user_role;
BEGIN
    v_role := public.signup_metadata_role(NEW.raw_user_meta_data->>'role');

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
            v_role
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
  'Auth signup trigger; portal roles only from metadata; RLS-safe inserts with non-fatal warnings.';

-- ---------------------------------------------------------------------------
-- Self-insert policy: portal roles only (trigger bypasses RLS; superadmin insert policy unchanged)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow trigger to insert user profiles" ON public.users;

CREATE POLICY "Allow trigger to insert user profiles"
    ON public.users FOR INSERT
    WITH CHECK (
        auth.uid() = id
        AND role IN (
          'customer'::public.user_role,
          'provider_owner'::public.user_role,
          'provider_staff'::public.user_role,
          'provider_onboarding'::public.user_role
        )
    );

-- ---------------------------------------------------------------------------
-- create_user_bypass_trigger: service_role only; force customer for other JWTs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_user_bypass_trigger(
  p_email text,
  p_full_name text DEFAULT '',
  p_phone text DEFAULT NULL,
  p_role text DEFAULT 'customer',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_encrypted_password text;
  v_result json;
  v_existing_auth_user record;
  v_meta jsonb;
  v_is_shadow boolean;
  v_role text;
BEGIN
  IF (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
    v_role := 'customer';
  ELSE
    v_role := COALESCE(NULLIF(trim(p_role), ''), 'customer');
  END IF;

  v_meta := COALESCE(p_metadata, '{}'::jsonb);
  v_is_shadow := COALESCE((v_meta->>'is_shadow')::boolean, false);

  SELECT id INTO v_existing_auth_user
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;

  IF FOUND THEN
    v_user_id := v_existing_auth_user.id;
  ELSE
    v_user_id := gen_random_uuid();
    v_encrypted_password := crypt(gen_random_uuid()::text, gen_salt('bf'));

    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      phone,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role,
      confirmation_token
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000'::uuid,
      p_email,
      CASE WHEN p_phone IS NOT NULL AND length(trim(p_phone)) > 0 THEN trim(p_phone) ELSE NULL END,
      v_encrypted_password,
      now(),
      now(),
      now(),
      jsonb_build_object(
        'provider', 'email',
        'providers', ARRAY['email']
      ),
      jsonb_build_object(
        'full_name', p_full_name,
        'phone', p_phone,
        'role', v_role
      ) || v_meta,
      'authenticated',
      'authenticated',
      ''
    );
  END IF;

  INSERT INTO public.users (
    id,
    email,
    full_name,
    phone,
    role,
    is_shadow,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    p_email,
    p_full_name,
    p_phone,
    v_role::user_role,
    v_is_shadow,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = COALESCE(EXCLUDED.phone, public.users.phone),
    is_shadow = CASE
      WHEN EXCLUDED.is_shadow THEN true
      ELSE public.users.is_shadow
    END,
    updated_at = now();

  INSERT INTO public.user_wallets (
    user_id,
    balance,
    currency,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    0,
    'ZAR',
    now(),
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  v_result := json_build_object(
    'user_id', v_user_id,
    'email', p_email,
    'success', true
  );

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM,
    'error_code', SQLSTATE
  );
END;
$$;

REVOKE ALL ON FUNCTION create_user_bypass_trigger(text, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_user_bypass_trigger(text, text, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION create_user_bypass_trigger(text, text, text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION create_user_bypass_trigger(text, text, text, text, jsonb) TO service_role;

COMMENT ON FUNCTION create_user_bypass_trigger(text, text, text, text, jsonb) IS
  'Creates auth + public user bypassing handle_new_user; service_role only; supports is_shadow metadata.';
