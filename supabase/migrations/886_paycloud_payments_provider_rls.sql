-- Migration 886: Provider-scoped RLS for provider_paycloud_payments.
-- Migration 770 only granted service_role access; migration 826 added provider policies
-- for terminals/settings/merchants but omitted payments. Authenticated API routes insert
-- and poll payment rows with the provider JWT, which failed RLS and surfaced as
-- INTERNAL_ERROR ("Failed to start payment") in the Partner app.

-- ── provider_paycloud_payments ────────────────────────────────────────────────
DROP POLICY IF EXISTS paycloud_payments_provider_select ON public.provider_paycloud_payments;
CREATE POLICY paycloud_payments_provider_select ON public.provider_paycloud_payments
  FOR SELECT
  TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM public.provider_staff WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS paycloud_payments_provider_insert ON public.provider_paycloud_payments;
CREATE POLICY paycloud_payments_provider_insert ON public.provider_paycloud_payments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.providers p
      WHERE p.id = provider_paycloud_payments.provider_id
        AND p.tenant_id = provider_paycloud_payments.tenant_id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.provider_staff ps
            WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS paycloud_payments_provider_update ON public.provider_paycloud_payments;
CREATE POLICY paycloud_payments_provider_update ON public.provider_paycloud_payments
  FOR UPDATE
  TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM public.provider_staff WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.providers p
      WHERE p.id = provider_paycloud_payments.provider_id
        AND p.tenant_id = provider_paycloud_payments.tenant_id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.provider_staff ps
            WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
          )
        )
    )
  );
