-- Admin users directory: SQL-level is_shadow filter (correct totals/pagination)
-- + shadow claim-funnel stats RPC for the admin SPA.

-- Drop the old signature first: CREATE OR REPLACE with an extra defaulted
-- parameter would create an overload and make PostgREST RPC calls ambiguous.
DROP FUNCTION IF EXISTS public.admin_users_list_for_tenant(uuid, int, int, text, text, text);

CREATE OR REPLACE FUNCTION public.admin_users_list_for_tenant(
  p_tenant_id uuid,
  p_limit int,
  p_offset int,
  p_search text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_signup_source text DEFAULT NULL,
  p_is_shadow boolean DEFAULT NULL
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
    )
    AND (p_is_shadow IS NULL OR COALESCE(u.is_shadow, false) = p_is_shadow);

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
      AND (p_is_shadow IS NULL OR COALESCE(u.is_shadow, false) = p_is_shadow)
    ORDER BY u.created_at DESC NULLS LAST
    LIMIT p_limit
    OFFSET p_offset
  ) t;

  RETURN jsonb_build_object('total', v_total, 'data', v_data);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_users_list_for_tenant(uuid, int, int, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_users_list_for_tenant(uuid, int, int, text, text, text, boolean) TO service_role;

-- Claim-funnel stats: guest (shadow) accounts awaiting claim vs claimed.
CREATE OR REPLACE FUNCTION public.admin_users_shadow_stats_for_tenant(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'shadow_unclaimed', COUNT(*) FILTER (WHERE COALESCE(u.is_shadow, false) = true),
    'claimed_total', COUNT(*) FILTER (WHERE u.claimed_at IS NOT NULL),
    'claimed_last_30d', COUNT(*) FILTER (WHERE u.claimed_at >= now() - interval '30 days')
  )
  FROM public.users u
  WHERE public.user_matches_admin_tenant_scope(u.id, p_tenant_id)
    AND (COALESCE(u.is_shadow, false) = true OR u.claimed_at IS NOT NULL);
$$;

COMMENT ON FUNCTION public.admin_users_shadow_stats_for_tenant(uuid) IS
  'Guest account claim funnel for the admin users directory: unclaimed shadow accounts, total claimed, claimed in last 30 days.';

REVOKE ALL ON FUNCTION public.admin_users_shadow_stats_for_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_users_shadow_stats_for_tenant(uuid) TO service_role;
