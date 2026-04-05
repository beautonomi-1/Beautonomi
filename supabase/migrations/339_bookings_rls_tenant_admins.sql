-- Narrow direct-PostgREST booking visibility: superadmin OR user_tenant_roles for the booking's tenant.

DROP POLICY IF EXISTS "Superadmins can view all bookings" ON public.bookings;

CREATE POLICY "Superadmins and tenant admins may view bookings"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
    OR tenant_id IN (
      SELECT utr.tenant_id FROM public.user_tenant_roles utr
      WHERE utr.user_id = auth.uid() AND utr.is_active
    )
  );
