-- Backfill Paystack Virtual Terminal subscription entitlements on every active plan.
-- Without this, setup requests return 403 SUBSCRIPTION_REQUIRED even when the platform flag is on.
-- max_terminals NULL = unlimited (see checkPaystackVirtualTerminalFeatureAccess + route limit checks).

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
