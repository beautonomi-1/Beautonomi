-- User signup source, verification queue fixes, auth sign-in batch for admin lists.

-- signup_source referenced by admin_users_list_for_tenant but never added to users.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS signup_source TEXT;

COMMENT ON COLUMN public.users.signup_source IS
  'How the user heard about us (e.g. google, app_store). Nullable for legacy/OAuth signups.';

-- Sumsub upserts use document_url = null and onConflict (user_id, document_type).
ALTER TABLE public.user_verifications
  ALTER COLUMN document_url DROP NOT NULL;

-- Keep newest row per (user_id, document_type) before unique index (legacy duplicates).
DELETE FROM public.user_verifications uv
USING (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, document_type
        ORDER BY COALESCE(reviewed_at, submitted_at, created_at) DESC NULLS LAST, id DESC
      ) AS rn
    FROM public.user_verifications
  ) ranked
  WHERE ranked.rn > 1
) dup
WHERE uv.id = dup.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_verifications_user_document_type
  ON public.user_verifications (user_id, document_type);

-- Sync users.identity_* when queue rows leave non-terminal states (manual review, Sumsub).
CREATE OR REPLACE FUNCTION public.update_user_verification_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('approved', 'rejected')
     AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM NEW.status)
     AND COALESCE(OLD.status, '') NOT IN ('approved', 'rejected') THEN
    UPDATE public.users
    SET
      identity_verified = (NEW.status = 'approved'),
      identity_verification_status = NEW.status,
      identity_verification_reviewed_at = NEW.reviewed_at,
      identity_verification_reviewed_by = NEW.reviewed_by
    WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Batch read auth.users sign-in / confirmation for admin user directory enrichment.
CREATE OR REPLACE FUNCTION public.admin_auth_users_sign_in_batch(p_user_ids uuid[])
RETURNS TABLE (
  id uuid,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id, u.last_sign_in_at, u.email_confirmed_at, u.phone_confirmed_at
  FROM auth.users u
  WHERE u.id = ANY(p_user_ids);
$$;

COMMENT ON FUNCTION public.admin_auth_users_sign_in_batch(uuid[]) IS
  'Service-role helper: last sign-in and confirmation timestamps from auth.users for admin lists.';

REVOKE ALL ON FUNCTION public.admin_auth_users_sign_in_batch(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_auth_users_sign_in_batch(uuid[]) TO service_role;

-- Allow admin user search by exact UUID (superadmin lookup).
CREATE OR REPLACE FUNCTION public.admin_users_list_for_tenant(
  p_tenant_id uuid,
  p_limit int,
  p_offset int,
  p_search text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_signup_source text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
  v_data jsonb;
  v_search text := NULLIF(trim(COALESCE(p_search, '')), '');
  v_role text := NULLIF(trim(COALESCE(p_role, '')), '');
  v_signup text := NULLIF(trim(COALESCE(p_signup_source, '')), '');
  v_search_uuid uuid := NULL;
BEGIN
  IF v_search IS NOT NULL AND v_search ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    BEGIN
      v_search_uuid := v_search::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_search_uuid := NULL;
    END;
  END IF;

  SELECT COUNT(*)::bigint INTO v_total
  FROM public.users u
  WHERE public.user_matches_admin_tenant_scope(u.id, p_tenant_id)
    AND (
      v_search IS NULL
      OR (v_search_uuid IS NOT NULL AND u.id = v_search_uuid)
      OR u.full_name ILIKE '%' || v_search || '%'
      OR u.email ILIKE '%' || v_search || '%'
      OR COALESCE(u.phone, '') ILIKE '%' || v_search || '%'
    )
    AND (v_role IS NULL OR lower(v_role) = 'all' OR u.role::text = v_role)
    AND (
      v_signup IS NULL
      OR lower(v_signup) = 'all'
      OR COALESCE(u.signup_source::text, '') = v_signup
    );

  SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_data
  FROM (
    SELECT u.*
    FROM public.users u
    WHERE public.user_matches_admin_tenant_scope(u.id, p_tenant_id)
      AND (
        v_search IS NULL
        OR (v_search_uuid IS NOT NULL AND u.id = v_search_uuid)
        OR u.full_name ILIKE '%' || v_search || '%'
        OR u.email ILIKE '%' || v_search || '%'
        OR COALESCE(u.phone, '') ILIKE '%' || v_search || '%'
      )
      AND (v_role IS NULL OR lower(v_role) = 'all' OR u.role::text = v_role)
      AND (
        v_signup IS NULL
        OR lower(v_signup) = 'all'
        OR COALESCE(u.signup_source::text, '') = v_signup
      )
    ORDER BY u.created_at DESC NULLS LAST
    LIMIT p_limit
    OFFSET p_offset
  ) t;

  RETURN jsonb_build_object('total', v_total, 'data', v_data);
END;
$$;
