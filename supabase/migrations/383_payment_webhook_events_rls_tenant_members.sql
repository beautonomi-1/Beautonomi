-- payment_webhook_events.idempotency ledger (334): tenant-scoped SELECT for support / ops
-- users with user_tenant_roles. Inserts remain service-role only (webhook handlers).

DROP POLICY IF EXISTS "Tenant role holders select payment_webhook_events" ON public.payment_webhook_events;
CREATE POLICY "Tenant role holders select payment_webhook_events"
  ON public.payment_webhook_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_tenant_roles utr
      WHERE utr.user_id = auth.uid()
        AND utr.tenant_id = payment_webhook_events.tenant_id
        AND utr.is_active = true
    )
  );

COMMENT ON POLICY "Tenant role holders select payment_webhook_events" ON public.payment_webhook_events IS
  'Tenant-scoped read for users with an active user_tenant_roles row (spec §6.1). Matches booking_payments RLS pattern (382).';
