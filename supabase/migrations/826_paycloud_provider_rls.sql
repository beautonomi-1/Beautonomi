-- Migration 826: Provider-scoped RLS for PayCloud tables (mirrors the Yoco / provider_terminal_devices pattern).
-- Migration 770 created these tables with service-role-only policies, so user-scoped Supabase
-- clients returned zero rows: a superadmin-assigned terminal was invisible in the provider app.
-- Writes stay tenant-pinned so a provider cannot attach a machine to another tenant.

-- ── paycloud_terminals ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS paycloud_terminals_provider_select ON public.paycloud_terminals;
CREATE POLICY paycloud_terminals_provider_select ON public.paycloud_terminals
  FOR SELECT
  TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM public.provider_staff WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS paycloud_terminals_provider_insert ON public.paycloud_terminals;
CREATE POLICY paycloud_terminals_provider_insert ON public.paycloud_terminals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.providers p
      WHERE p.id = paycloud_terminals.provider_id
        AND p.tenant_id = paycloud_terminals.tenant_id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.provider_staff ps
            WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS paycloud_terminals_provider_update ON public.paycloud_terminals;
CREATE POLICY paycloud_terminals_provider_update ON public.paycloud_terminals
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
      WHERE p.id = paycloud_terminals.provider_id
        AND p.tenant_id = paycloud_terminals.tenant_id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.provider_staff ps
            WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
          )
        )
    )
  );

-- ── provider_paycloud_settings ────────────────────────────────────────────────
DROP POLICY IF EXISTS paycloud_settings_provider_select ON public.provider_paycloud_settings;
CREATE POLICY paycloud_settings_provider_select ON public.provider_paycloud_settings
  FOR SELECT
  TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM public.provider_staff WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS paycloud_settings_provider_insert ON public.provider_paycloud_settings;
CREATE POLICY paycloud_settings_provider_insert ON public.provider_paycloud_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.providers p
      WHERE p.id = provider_paycloud_settings.provider_id
        AND p.tenant_id = provider_paycloud_settings.tenant_id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.provider_staff ps
            WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS paycloud_settings_provider_update ON public.provider_paycloud_settings;
CREATE POLICY paycloud_settings_provider_update ON public.provider_paycloud_settings
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
      WHERE p.id = provider_paycloud_settings.provider_id
        AND p.tenant_id = provider_paycloud_settings.tenant_id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.provider_staff ps
            WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
          )
        )
    )
  );

-- ── paycloud_merchants ────────────────────────────────────────────────────────
-- Read-only, and only for merchants already linked to one of this provider's machines
-- (the card machines list embeds merchant label / merchant_no / store_no).
DROP POLICY IF EXISTS paycloud_merchants_provider_select ON public.paycloud_merchants;
CREATE POLICY paycloud_merchants_provider_select ON public.paycloud_merchants
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT DISTINCT pt.paycloud_merchant_id
      FROM public.paycloud_terminals pt
      WHERE pt.paycloud_merchant_id IS NOT NULL
        AND pt.provider_id IN (
          SELECT id FROM public.providers WHERE user_id = auth.uid()
          UNION
          SELECT provider_id FROM public.provider_staff WHERE user_id = auth.uid()
        )
    )
  );
