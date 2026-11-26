-- Migration 10300 revoked authenticated SELECT on providers.user_id and
-- provider_staff.user_id. RLS policies on other tables still compared those
-- columns, so authenticated reads and updates failed with
-- "permission denied for table provider_staff" (the column grant hint is
-- table-level). Membership checks go through the existing SECURITY DEFINER
-- helpers, which keep private columns unreadable.

-- is_provider_staff(provider_id) compared ps.provider_id = provider_id. The
-- argument name matches the column, so PL/pgSQL raises "column reference
-- provider_id is ambiguous" and the WHEN OTHERS handler returns false. Staff
-- membership checks then deny every row. Qualify the argument; Postgres will
-- not let CREATE OR REPLACE rename it.
CREATE OR REPLACE FUNCTION public.is_provider_staff(provider_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'gis', 'pg_temp'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.provider_staff ps
    WHERE ps.provider_id = is_provider_staff.provider_id
      AND ps.user_id = auth.uid()
      AND ps.is_active = true
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_access_provider(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_provider_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_provider_owner(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Providers can view own provider bookings" ON public.bookings;
CREATE POLICY "Providers can view own provider bookings"
  ON public.bookings
  FOR SELECT
  TO authenticated, service_role
  USING (public.can_access_provider(provider_id));

DROP POLICY IF EXISTS "Providers can view refunds" ON public.booking_refunds;
CREATE POLICY "Providers can view refunds"
  ON public.booking_refunds
  FOR SELECT
  TO authenticated, service_role
  USING (
    EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id = booking_refunds.booking_id
        AND public.can_access_provider(b.provider_id)
    )
  );
