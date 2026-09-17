-- Per-provider admin payout holds (fraud / trust enforcement).
-- Distinct from tenant-wide payout_hold_days settling delay in platform_settings.

CREATE TABLE IF NOT EXISTS public.provider_payout_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  fraud_case_id UUID REFERENCES public.fraud_cases(id) ON DELETE SET NULL,
  placed_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  released_at TIMESTAMPTZ,
  released_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  release_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_payout_holds_active_provider
  ON public.provider_payout_holds (provider_id)
  WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_provider_payout_holds_tenant_provider
  ON public.provider_payout_holds (tenant_id, provider_id, created_at DESC);

ALTER TABLE public.provider_payout_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_payout_holds_admin ON public.provider_payout_holds;

CREATE POLICY provider_payout_holds_admin
  ON public.provider_payout_holds
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('superadmin', 'support_agent')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('superadmin', 'support_agent')
    )
  );
