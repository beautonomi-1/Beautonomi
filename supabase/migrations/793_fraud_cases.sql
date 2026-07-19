-- Phase 11: Fraud case management (tenant-scoped).

CREATE TABLE IF NOT EXISTS public.fraud_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'review', 'held', 'released', 'closed')),
  risk_score NUMERIC(5, 2),
  subject_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  subject_provider_id UUID REFERENCES public.providers(id) ON DELETE SET NULL,
  payment_provider TEXT,
  payment_reference TEXT,
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision TEXT,
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_cases_tenant_status ON public.fraud_cases(tenant_id, status, created_at DESC);

ALTER TABLE public.fraud_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY fraud_cases_tenant_ops
  ON public.fraud_cases
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('superadmin', 'support_agent')
    )
    OR EXISTS (
      SELECT 1 FROM public.user_tenant_roles utr
      WHERE utr.user_id = auth.uid() AND utr.tenant_id = fraud_cases.tenant_id AND utr.is_active
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('superadmin', 'support_agent')
    )
    OR EXISTS (
      SELECT 1 FROM public.user_tenant_roles utr
      WHERE utr.user_id = auth.uid() AND utr.tenant_id = fraud_cases.tenant_id AND utr.is_active
    )
  );
