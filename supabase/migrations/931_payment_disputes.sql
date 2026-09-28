-- Open payment disputes reserve provider payoutable balance until resolved.

CREATE TABLE IF NOT EXISTS public.payment_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES public.providers(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  payment_provider TEXT NOT NULL,
  dispute_id TEXT NOT NULL,
  payment_reference TEXT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'ZAR',
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'merchant_won', 'customer_won', 'awaiting_bank')),
  resolution TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payment_provider, dispute_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_disputes_provider_open
  ON public.payment_disputes (provider_id, status)
  WHERE status = 'open';

ALTER TABLE public.payment_disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_disputes_service_role
  ON public.payment_disputes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY payment_disputes_provider_select
  ON public.payment_disputes
  FOR SELECT
  TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM public.provider_staff WHERE user_id = auth.uid()
    )
  );
