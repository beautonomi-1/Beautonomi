-- Migration 761: Terminal commercial go-live flags
--
-- Enables admin Commercial Operations terminal pages and provider-facing
-- terminal commerce. Safe to re-run (updates existing global rows only).

UPDATE public.feature_flags
SET enabled = true, updated_at = now()
WHERE tenant_id IS NULL
  AND feature_key IN (
    'superadmin_terminal_insights_enabled',
    'terminal_product_catalog_enabled',
    'terminal_ecommerce_enabled',
    'terminal_campaigns_enabled',
    'terminal_upsell_enabled',
    'terminal_subscription_bundle_enabled',
    'provider_terminal_capture_enabled',
    'terminal_accounting_enabled'
  );

-- Per-vendor integration flags (759) — enable all seeded vendors for rollout
UPDATE public.feature_flags
SET enabled = true, updated_at = now()
WHERE tenant_id IS NULL
  AND feature_key LIKE 'terminal_vendor_%_enabled';
