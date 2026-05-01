-- Align dashboard customer totals and signup bands with user_matches_admin_tenant_scope (migration 561).

CREATE OR REPLACE FUNCTION public.admin_dashboard_tenant_customer_count(p_tenant_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint
  FROM public.users u
  WHERE u.role = 'customer'
    AND public.user_matches_admin_tenant_scope(u.id, p_tenant_id);
$$;

COMMENT ON FUNCTION public.admin_dashboard_tenant_customer_count(uuid) IS
  'Admin dashboard: distinct customers in tenant admin scope (same as user directory).';

REVOKE ALL ON FUNCTION public.admin_dashboard_tenant_customer_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_tenant_customer_count(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_count_users_in_tenant_scope_created_between(
  p_tenant_id uuid,
  p_role text,
  p_created_at_min timestamptz,
  p_created_at_max timestamptz DEFAULT NULL
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
    AND (p_role IS NULL OR trim(COALESCE(p_role, '')) = '' OR u.role::text = p_role)
    AND u.created_at >= p_created_at_min
    AND (p_created_at_max IS NULL OR u.created_at <= p_created_at_max);
$$;

COMMENT ON FUNCTION public.admin_count_users_in_tenant_scope_created_between(uuid, text, timestamptz, timestamptz) IS
  'Count tenant-scoped users with optional role filter and created_at window (for admin dashboard growth cards).';

GRANT EXECUTE ON FUNCTION public.admin_count_users_in_tenant_scope_created_between(uuid, text, timestamptz, timestamptz) TO service_role;
