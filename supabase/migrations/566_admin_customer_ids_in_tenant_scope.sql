-- Full customer-id list for tenant-scoped admin workflows (e.g. broadcasts) — no arbitrary caps.

CREATE OR REPLACE FUNCTION public.admin_customer_ids_in_tenant_scope(p_tenant_id uuid)
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.users u
  WHERE u.role = 'customer'
    AND public.user_matches_admin_tenant_scope(u.id, p_tenant_id);
$$;

COMMENT ON FUNCTION public.admin_customer_ids_in_tenant_scope(uuid) IS
  'All customer user IDs visible to admin for this tenant (same scope as user directory).';

GRANT EXECUTE ON FUNCTION public.admin_customer_ids_in_tenant_scope(uuid) TO service_role;
