-- Tenant-scoped SELECT for ledger tables (376): users with user_tenant_roles can read rows
-- in their tenant(s). Complements booking-join policies in 230 (finance_transactions) and
-- customer wallet policies in 002 (wallet_transactions).

-- ── finance_transactions ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Tenant role holders select finance_transactions" ON public.finance_transactions;
CREATE POLICY "Tenant role holders select finance_transactions"
  ON public.finance_transactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_tenant_roles utr
      WHERE utr.user_id = auth.uid()
        AND utr.tenant_id = finance_transactions.tenant_id
        AND utr.is_active = true
    )
  );

COMMENT ON POLICY "Tenant role holders select finance_transactions" ON public.finance_transactions IS
  'Tenant-scoped read for users with an active user_tenant_roles row (spec §6.1). Requires NOT NULL tenant_id (376).';

-- ── wallet_transactions ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Tenant role holders select wallet_transactions" ON public.wallet_transactions;
CREATE POLICY "Tenant role holders select wallet_transactions"
  ON public.wallet_transactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_tenant_roles utr
      WHERE utr.user_id = auth.uid()
        AND utr.tenant_id = wallet_transactions.tenant_id
        AND utr.is_active = true
    )
  );

COMMENT ON POLICY "Tenant role holders select wallet_transactions" ON public.wallet_transactions IS
  'Tenant-scoped read for users with an active user_tenant_roles row (spec §6.1). Requires NOT NULL tenant_id (376).';
