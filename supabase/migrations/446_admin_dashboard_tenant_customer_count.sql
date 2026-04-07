-- Distinct customer count for admin dashboard (tenant scope): preferred home OR booking in market.

CREATE OR REPLACE FUNCTION public.admin_dashboard_tenant_customer_count(p_tenant_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint FROM (
    SELECT u.id
    FROM public.users u
    WHERE u.role = 'customer' AND u.preferred_home_tenant_id = p_tenant_id
    UNION
    SELECT b.customer_id AS id
    FROM public.bookings b
    INNER JOIN public.users u ON u.id = b.customer_id AND u.role = 'customer'
    WHERE b.tenant_id = p_tenant_id AND b.customer_id IS NOT NULL
  ) x;
$$;

COMMENT ON FUNCTION public.admin_dashboard_tenant_customer_count(uuid) IS
  'Admin dashboard: count distinct customers (role customer) with preferred_home_tenant OR any booking in the tenant.';

REVOKE ALL ON FUNCTION public.admin_dashboard_tenant_customer_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_tenant_customer_count(uuid) TO service_role;
