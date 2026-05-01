-- Helpers built on user_matches_admin_tenant_scope (migration 561) for admin analytics,
-- search, reports, and support — no capped IN(...) lists.

CREATE OR REPLACE FUNCTION public.admin_count_users_in_tenant_scope(
  p_tenant_id uuid,
  p_role text DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint
  FROM public.users u
  WHERE public.user_matches_admin_tenant_scope(u.id, p_tenant_id)
    AND (p_role IS NULL OR trim(p_role) = '' OR u.role::text = p_role);
$$;

CREATE OR REPLACE FUNCTION public.admin_users_in_tenant_scope(
  p_tenant_id uuid,
  p_role text DEFAULT NULL
)
RETURNS SETOF users
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.*
  FROM public.users u
  WHERE public.user_matches_admin_tenant_scope(u.id, p_tenant_id)
    AND (p_role IS NULL OR trim(p_role) = '' OR u.role::text = p_role)
  ORDER BY u.created_at DESC NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.admin_user_ids_in_tenant_scope(p_tenant_id uuid)
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.users u
  WHERE public.user_matches_admin_tenant_scope(u.id, p_tenant_id);
$$;

CREATE OR REPLACE FUNCTION public.admin_users_created_at_in_scope(
  p_tenant_id uuid,
  p_since timestamptz,
  p_role text DEFAULT 'customer'
)
RETURNS TABLE(created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.created_at
  FROM public.users u
  WHERE public.user_matches_admin_tenant_scope(u.id, p_tenant_id)
    AND (p_role IS NULL OR trim(p_role) = '' OR u.role::text = p_role)
    AND u.created_at >= p_since
  ORDER BY u.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.admin_count_users_in_tenant_scope(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_users_in_tenant_scope(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_user_ids_in_tenant_scope(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_users_created_at_in_scope(uuid, timestamptz, text) TO service_role;
