-- Migration 200: Create function to bypass the broken trigger and create users directly
-- This function inserts into auth.users and public.users without relying on the trigger

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS create_user_bypass_trigger(text, text, text, text);

-- Create a function that inserts into auth.users and public.users directly
-- This bypasses the broken handle_new_user trigger
CREATE OR REPLACE FUNCTION create_user_bypass_trigger(
  p_email text,
  p_full_name text DEFAULT '',
  p_phone text DEFAULT NULL,
  p_role text DEFAULT 'customer'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_encrypted_password text;
  v_result json;
  v_existing_auth_user record;
BEGIN
  -- First, check if user already exists in auth.users (from failed SDK attempts)
  SELECT id INTO v_existing_auth_user
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;
  
  IF FOUND THEN
    -- User exists in auth.users, use that ID
    v_user_id := v_existing_auth_user.id;
  ELSE
    -- Generate a new UUID for the user
    v_user_id := gen_random_uuid();
    
    -- Generate a random password (user won't use it since email is confirmed)
    v_encrypted_password := crypt(gen_random_uuid()::text, gen_salt('bf'));
    
    -- Insert directly into auth.users (bypassing trigger)
    INSERT INTO auth.users (
    id,
    instance_id,
    email,
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
    ),
    'authenticated',
    'authenticated',
    ''
  );
  END IF;
  
  -- Insert into public.users (bypassing trigger), skip if already exists
  -- Cast p_role to user_role enum type to fix type mismatch
  INSERT INTO public.users (
    id,
    email,
    full_name,
    phone,
    role,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    p_email,
    p_full_name,
    p_phone,
    p_role::user_role,  -- Cast to user_role enum
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;  -- Skip if public.users row already exists
  
  -- Create wallet for the user
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
  
  -- Return the user ID and email as JSON
  v_result := json_build_object(
    'user_id', v_user_id,
    'email', p_email,
    'success', true
  );
  
  RETURN v_result;
  
EXCEPTION WHEN OTHERS THEN
  -- Return error as JSON
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM,
    'error_code', SQLSTATE
  );
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION create_user_bypass_trigger(text, text, text, text) TO service_role;

-- Add comment
COMMENT ON FUNCTION create_user_bypass_trigger IS 'Creates a user by directly inserting into auth.users and public.users, bypassing the broken handle_new_user trigger';
