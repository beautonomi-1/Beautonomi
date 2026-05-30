-- Idempotent repair: force unlimited Paystack Virtual Terminal entitlements on all active plans.
-- Safe to re-run after 636 if plans were partially updated or manually edited.

UPDATE public.subscription_plans
SET features = COALESCE(features, '{}'::jsonb) || jsonb_build_object(
  'paystack_virtual_terminal', jsonb_build_object(
    'enabled', true,
    'max_terminals', NULL,
    'per_location_terminals', true,
    'advanced_reconciliation', true,
    'split_settlement', true
  )
)
WHERE is_active = true;
