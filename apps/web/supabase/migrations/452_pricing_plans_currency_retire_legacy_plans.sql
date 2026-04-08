-- Sync with repo root migration: optional display currency; hide legacy Professional/Enterprise template rows.

ALTER TABLE public.pricing_plans
  ADD COLUMN IF NOT EXISTS currency text;

COMMENT ON COLUMN public.pricing_plans.currency IS
  'Optional ISO-style currency label for the public pricing page (e.g. ZAR, USD). Does not change billing; use subscription_plans.currency for Paystack.';

UPDATE public.pricing_plans
SET
  is_active = false,
  updated_at = now()
WHERE tenant_id IS NULL
  AND name IN ('Professional', 'Enterprise');
