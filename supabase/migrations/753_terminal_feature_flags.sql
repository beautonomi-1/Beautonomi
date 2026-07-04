-- Migration 753: Terminal feature flags
--
-- Seeds 8 feature flags for the terminal capture & commerce feature.
-- provider_terminal_capture_enabled is ON by default.
-- All commerce/upsell flags default OFF for controlled rollout.

INSERT INTO public.feature_flags (feature_key, feature_name, description, enabled, category)
SELECT key, name, descr, enabled_default, 'terminal'
FROM (VALUES
  (
    'provider_terminal_capture_enabled',
    'Provider terminal capture',
    'Enable the generic card machine / payment terminal question in provider onboarding and profile edit.',
    true
  ),
  (
    'superadmin_terminal_insights_enabled',
    'Superadmin terminal insights',
    'Show Commercial Operations → Terminal Insights in the admin portal.',
    false
  ),
  (
    'terminal_upsell_enabled',
    'Terminal upsell',
    'Show terminal upsell banners and prompts to eligible providers.',
    false
  ),
  (
    'terminal_product_catalog_enabled',
    'Terminal product catalog',
    'Enable the terminal product catalog (admin management and provider browsing).',
    false
  ),
  (
    'terminal_ecommerce_enabled',
    'Terminal e-commerce',
    'Allow providers to place terminal orders from the platform (purchase, rental, bundle).',
    false
  ),
  (
    'terminal_subscription_bundle_enabled',
    'Terminal subscription bundle',
    'Enable terminal device bundling within subscription plans.',
    false
  ),
  (
    'terminal_campaigns_enabled',
    'Terminal campaigns',
    'Enable targeted terminal marketing campaigns to provider cohorts.',
    false
  ),
  (
    'terminal_accounting_enabled',
    'Terminal accounting',
    'Enable accounting postings and GL entries for terminal commerce transactions.',
    false
  )
) AS t(key, name, descr, enabled_default)
WHERE NOT EXISTS (
  SELECT 1 FROM public.feature_flags ff
  WHERE ff.feature_key = t.key AND ff.tenant_id IS NULL
);
