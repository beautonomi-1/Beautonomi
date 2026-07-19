-- 802: launch-readiness RLS hardening (financial period locks, Yoco webhooks,
-- journal tenant scoping, fraud_cases support_agent scope, support-ticket storage)

-- ── financial_period_locks: service_role writes only ────────────────────────
DROP POLICY IF EXISTS "Service role full access on financial_period_locks" ON public.financial_period_locks;
CREATE POLICY financial_period_locks_service_role
  ON public.financial_period_locks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Yoco webhook events / refunds: service_role only (API uses admin client) ─
DROP POLICY IF EXISTS "Allow webhook ingest" ON public.provider_yoco_webhook_events;
CREATE POLICY provider_yoco_webhook_events_service_role
  ON public.provider_yoco_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service can insert Yoco refunds" ON public.provider_yoco_refunds;
DROP POLICY IF EXISTS "Providers can view their own Yoco refunds" ON public.provider_yoco_refunds;
CREATE POLICY provider_yoco_refunds_service_role
  ON public.provider_yoco_refunds
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY provider_yoco_refunds_provider_read
  ON public.provider_yoco_refunds
  FOR SELECT
  TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM public.provider_staff WHERE user_id = auth.uid()
    )
  );

-- ── journal_entries: tenant-scoped admin reads ───────────────────────────────
DROP POLICY IF EXISTS journal_entries_read ON public.journal_entries;
CREATE POLICY journal_entries_read ON public.journal_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
    OR (
      journal_entries.tenant_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_tenant_roles utr
        WHERE utr.user_id = auth.uid()
          AND utr.is_active
          AND utr.tenant_id = journal_entries.tenant_id
          AND EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
              AND u.role IN ('admin_finance', 'admin_operations')
          )
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.provider_staff ps
      WHERE ps.provider_id = journal_entries.provider_id AND ps.user_id = auth.uid()
    )
  );

-- gl_accounts is a global chart (no tenant_id) — restrict to finance admins
DROP POLICY IF EXISTS gl_accounts_read ON public.gl_accounts;
CREATE POLICY gl_accounts_read ON public.gl_accounts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('superadmin', 'admin_finance', 'admin_operations')
    )
  );

-- ── fraud_cases: tenant-scoped support_agent (match 792 ticket pattern) ─────
DROP POLICY IF EXISTS fraud_cases_tenant_ops ON public.fraud_cases;
CREATE POLICY fraud_cases_tenant_ops
  ON public.fraud_cases
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'support_agent'
      )
      AND EXISTS (
        SELECT 1 FROM public.user_tenant_roles utr
        WHERE utr.user_id = auth.uid()
          AND utr.is_active
          AND utr.tenant_id = fraud_cases.tenant_id
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.user_tenant_roles utr
      WHERE utr.user_id = auth.uid()
        AND utr.tenant_id = fraud_cases.tenant_id
        AND utr.is_active
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'support_agent'
      )
      AND EXISTS (
        SELECT 1 FROM public.user_tenant_roles utr
        WHERE utr.user_id = auth.uid()
          AND utr.is_active
          AND utr.tenant_id = fraud_cases.tenant_id
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.user_tenant_roles utr
      WHERE utr.user_id = auth.uid()
        AND utr.tenant_id = fraud_cases.tenant_id
        AND utr.is_active
    )
  );

-- ── support-ticket attachments: tenant-scoped support_agent ─────────────────
CREATE OR REPLACE FUNCTION public.user_can_access_message_attachment_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN (storage.foldername(p_name))[1] = 'support-tickets' THEN
      public.support_agent_can_access_ticket(
        ((storage.foldername(p_name))[2])::uuid
      )
    ELSE
      EXISTS (
        SELECT 1
        FROM public.conversations c
        WHERE c.id::text = (storage.foldername(p_name))[1]
          AND (
            c.customer_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.providers p
              WHERE p.id = c.provider_id AND p.user_id = auth.uid()
            )
            OR EXISTS (
              SELECT 1 FROM public.provider_staff ps
              WHERE ps.provider_id = c.provider_id AND ps.user_id = auth.uid()
            )
          )
      )
  END;
$$;
