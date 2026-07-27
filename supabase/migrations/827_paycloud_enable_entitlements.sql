-- Migration 827: Enable PayCloud card machines platform-wide and seed plan entitlements.
-- Card machines were gated behind three independent switches (platform flag, plan
-- entitlement, registry default), so every provider hit "upgrade your plan". Product
-- decision: card machines are available on every active plan, free included, with
-- paid plans getting a higher terminal cap and the advanced features.
-- Sub-keys are merged, not replaced, so admin-tuned values (e.g. terminal_bundle
-- commercial_model) survive.

-- ── 1. Platform kill switch ───────────────────────────────────────────────────
INSERT INTO public.feature_flags (feature_key, feature_name, description, enabled, category)
SELECT
  'payment_paycloud',
  'PayCloud card machines',
  'Enable provider-side Beautonomi card machine collection via PayCloud/WiseCashier Cloud Mode.',
  true,
  'payments'
WHERE NOT EXISTS (
  SELECT 1 FROM public.feature_flags
  WHERE feature_key = 'payment_paycloud' AND tenant_id IS NULL
);

-- Tenant override rows are left alone: a superadmin may have disabled a specific market.
UPDATE public.feature_flags
SET enabled = true, updated_at = now()
WHERE tenant_id IS NULL AND feature_key = 'payment_paycloud';

-- ── 2. paycloud_integration entitlement on every active plan ──────────────────
UPDATE public.subscription_plans
SET features = COALESCE(features, '{}'::jsonb) || jsonb_build_object(
      'paycloud_integration',
      COALESCE(features -> 'paycloud_integration', '{}'::jsonb) || jsonb_build_object(
        'enabled', true,
        'max_terminals', CASE WHEN COALESCE(is_free, false) THEN 1 ELSE 5 END,
        'advanced_features', NOT COALESCE(is_free, false)
      )
    ),
    updated_at = now()
WHERE is_active = true;

-- ── 3. terminal_bundle: one included PayCloud machine per plan ────────────────
UPDATE public.subscription_plans
SET features = COALESCE(features, '{}'::jsonb) || jsonb_build_object(
      'terminal_bundle',
      COALESCE(features -> 'terminal_bundle', '{}'::jsonb) || jsonb_build_object(
        'enabled', true,
        'included_terminal_count', 1,
        'terminal_model', 'paycloud'
      )
    ),
    updated_at = now()
WHERE is_active = true;
