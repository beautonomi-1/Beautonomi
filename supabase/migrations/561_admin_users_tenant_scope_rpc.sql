-- Admin users: same tenant visibility as apps/web getUserRowIfAccessibleToAdminTenant (detail API).
-- Avoids capped IN(...) lists on GET /api/admin/users and keeps list/detail aligned.

CREATE OR REPLACE FUNCTION public.user_matches_admin_tenant_scope(p_user_id uuid, p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id AND u.preferred_home_tenant_id = p_tenant_id)
  OR EXISTS (
    SELECT 1 FROM public.providers p
    WHERE p.user_id = p_user_id AND p.tenant_id = p_tenant_id
  )
  OR EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.tenant_id = p_tenant_id
      AND b.customer_id = p_user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.product_orders po
    INNER JOIN public.providers pr ON pr.id = po.provider_id AND pr.tenant_id = p_tenant_id
    WHERE po.customer_id = p_user_id
  );
$$;

COMMENT ON FUNCTION public.user_matches_admin_tenant_scope(uuid, uuid) IS
  'Whether an admin operating in p_tenant_id may view/mutate this user (directory + detail parity).';

CREATE OR REPLACE FUNCTION public.get_user_if_admin_tenant_accessible(p_user_id uuid, p_tenant_id uuid)
RETURNS SETOF users
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.*
  FROM public.users u
  WHERE u.id = p_user_id
    AND public.user_matches_admin_tenant_scope(u.id, p_tenant_id);
$$;

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
BEGIN
  SELECT COUNT(*)::bigint INTO v_total
  FROM public.users u
  WHERE public.user_matches_admin_tenant_scope(u.id, p_tenant_id)
    AND (
      v_search IS NULL
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

GRANT EXECUTE ON FUNCTION public.user_matches_admin_tenant_scope(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_if_admin_tenant_accessible(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_users_list_for_tenant(uuid, int, int, text, text, text) TO service_role;
