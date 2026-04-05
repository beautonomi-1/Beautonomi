-- booking_payments.tenant_id (381): allow tenant ops / support users with user_tenant_roles to SELECT
-- rows in their tenant(s). Complements booking-join policies in 230 (OR semantics).

DROP POLICY IF EXISTS "Tenant role holders select booking_payments" ON public.booking_payments;
CREATE POLICY "Tenant role holders select booking_payments"
  ON public.booking_payments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_tenant_roles utr
      WHERE utr.user_id = auth.uid()
        AND utr.tenant_id = booking_payments.tenant_id
        AND utr.is_active = true
    )
  );

COMMENT ON POLICY "Tenant role holders select booking_payments" ON public.booking_payments IS
  'Tenant-scoped read for users with an active user_tenant_roles row (spec §6.1). Requires 381 NOT NULL tenant_id.';
