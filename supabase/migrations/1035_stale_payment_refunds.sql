-- Track automatic Paystack refunds when a charge lands after the payable window closed
-- (e.g. custom offer no longer payment_pending).

CREATE TABLE IF NOT EXISTS public.stale_payment_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  payment_reference TEXT NOT NULL,
  amount_minor BIGINT,
  currency TEXT,
  offer_status TEXT,
  reason TEXT,
  refund_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (refund_status IN ('pending', 'completed', 'failed')),
  paystack_refund_reference TEXT,
  failure_reason TEXT,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT stale_payment_refunds_unique_source_ref UNIQUE (source_type, source_id, payment_reference)
);

CREATE INDEX IF NOT EXISTS idx_stale_payment_refunds_source
  ON public.stale_payment_refunds (source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_stale_payment_refunds_status
  ON public.stale_payment_refunds (refund_status)
  WHERE refund_status IN ('pending', 'failed');

ALTER TABLE public.stale_payment_refunds ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.stale_payment_refunds IS
  'Idempotent log of automatic refunds for charges that could not be applied to the intended payable record.';
