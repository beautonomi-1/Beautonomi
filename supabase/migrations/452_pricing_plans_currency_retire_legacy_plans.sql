-- Optional display currency for marketing pricing cards; retire legacy template plans from old seed.

ALTER TABLE public.pricing_plans
  ADD COLUMN IF NOT EXISTS currency text;

COMMENT ON COLUMN public.pricing_plans.currency IS
  'Optional ISO-style currency label for the public pricing page (e.g. ZAR, USD). Does not change billing; use subscription_plans.currency for Paystack.';

-- Legacy placeholder rows from 066_pricing_content.sql ($29 Professional, Enterprise) — hide from public pricing.
UPDATE public.pricing_plans
SET
  is_active = false,
  updated_at = now()
WHERE tenant_id IS NULL
  AND name IN ('Professional', 'Enterprise');
