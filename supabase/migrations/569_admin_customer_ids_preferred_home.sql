-- Broaden admin broadcast customer audience: customers who set this tenant as home,
-- or have a booking or product order under the tenant (explicit tenant ties).

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
    AND (
      u.preferred_home_tenant_id = p_tenant_id
      OR EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.tenant_id = p_tenant_id AND b.customer_id = u.id
      )
      OR EXISTS (
        SELECT 1 FROM public.product_orders po
        INNER JOIN public.providers pr ON pr.id = po.provider_id AND pr.tenant_id = p_tenant_id
        WHERE po.customer_id = u.id
      )
    );
$$;

COMMENT ON FUNCTION public.admin_customer_ids_in_tenant_scope(uuid) IS
  'Customer user IDs for tenant-scoped admin workflows (preferred_home_tenant_id OR booking/order under tenant).';
