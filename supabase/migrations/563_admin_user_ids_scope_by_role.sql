-- Bounded ID list for admin UIs that need tenant-scoped users by role (e.g. Gods Eye map markers)
-- without loading full user rows or applying legacy capped IN(...) heuristics.

CREATE OR REPLACE FUNCTION public.admin_user_ids_in_tenant_scope_for_role(
  p_tenant_id uuid,
  p_role text,
  p_limit int DEFAULT 4000
)
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.users u
  WHERE public.user_matches_admin_tenant_scope(u.id, p_tenant_id)
    AND (trim(COALESCE(p_role, '')) = '' OR u.role::text = p_role)
  ORDER BY u.created_at DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(COALESCE(NULLIF(p_limit, 0), 4000), 50000));
$$;

COMMENT ON FUNCTION public.admin_user_ids_in_tenant_scope_for_role(uuid, text, int) IS
  'Tenant-scoped user ids filtered by role, newest first, capped for PostgREST IN(...) usage.';

GRANT EXECUTE ON FUNCTION public.admin_user_ids_in_tenant_scope_for_role(uuid, text, int) TO service_role;
