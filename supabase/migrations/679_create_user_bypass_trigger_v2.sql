-- Extend bypass trigger: metadata jsonb + auth.users.phone for phone-OTP claim

DROP FUNCTION IF EXISTS create_user_bypass_trigger(text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS create_user_bypass_trigger(text, text, text, text);

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
BEGIN
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
        'role', p_role
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
    p_role::user_role,
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

GRANT EXECUTE ON FUNCTION create_user_bypass_trigger(text, text, text, text, jsonb) TO service_role;

COMMENT ON FUNCTION create_user_bypass_trigger(text, text, text, text, jsonb) IS
  'Creates auth + public user bypassing handle_new_user; supports is_shadow metadata and auth.users.phone.';
