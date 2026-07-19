-- Fraud case idempotency for deterministic auto-open from webhooks and support flows.

ALTER TABLE public.fraud_cases
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fraud_cases_tenant_idempotency
  ON public.fraud_cases (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.fraud_cases.idempotency_key IS
  'Stable key for webhook/ticket dedupe (e.g. stripe:dispute:dp_xxx). Unique per tenant when set.';
