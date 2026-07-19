-- Phase 12: Reconciliation exception queue (three-way reconciliation engine storage).

CREATE TABLE IF NOT EXISTS public.reconciliation_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  psp TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ledger', 'psp', 'bank')),
  external_id TEXT,
  internal_id UUID,
  amount NUMERIC(18, 4),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'matched', 'written_off', 'escalated')),
  mismatch_reason TEXT,
  maker_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  checker_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_exceptions_tenant
  ON public.reconciliation_exceptions(tenant_id, currency, psp, status, created_at DESC);

ALTER TABLE public.reconciliation_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY reconciliation_exceptions_finance_ops
  ON public.reconciliation_exceptions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_tenant_roles utr
      WHERE utr.user_id = auth.uid() AND utr.tenant_id = reconciliation_exceptions.tenant_id AND utr.is_active
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_tenant_roles utr
      WHERE utr.user_id = auth.uid() AND utr.tenant_id = reconciliation_exceptions.tenant_id AND utr.is_active
    )
  );
