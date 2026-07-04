-- Migration 759: Feature flags for terminal integrations hub and per-vendor gates
--
-- Architecture:
--   terminal_integrations_enabled    — master switch: shows/hides the entire
--                                      "Terminal Integrations" section in provider settings
--   terminal_vendor_<slug>_enabled   — per-vendor gate: when off, provider cannot
--                                      connect that vendor even if hub is visible
--
-- Default: hub ON, all vendors OFF (controlled rollout by Superadmin).

INSERT INTO public.feature_flags (feature_key, feature_name, description, enabled, category)
SELECT key, name, descr, enabled_default, 'terminal_integrations'
FROM (VALUES
  (
    'terminal_integrations_enabled',
    'Terminal integrations hub',
    'Show the Terminal Integrations section in provider settings, allowing providers to connect their existing card machines. Master switch — turn off to hide the entire section.',
    true
  ),
  (
    'terminal_vendor_wappoint_enabled',
    'Wappoint integration',
    'Allow providers to connect Wappoint card machines. Requires terminal_integrations_enabled.',
    false
  ),
  (
    'terminal_vendor_ikhokha_enabled',
    'iKhokha integration',
    'Allow providers to connect iKhokha card machines. Requires terminal_integrations_enabled.',
    false
  ),
  (
    'terminal_vendor_fnb_enabled',
    'FNB terminal integration',
    'Allow providers to connect FNB merchant terminal. Requires terminal_integrations_enabled.',
    false
  ),
  (
    'terminal_vendor_capitec_enabled',
    'Capitec terminal integration',
    'Allow providers to connect Capitec merchant terminal. Requires terminal_integrations_enabled.',
    false
  ),
  (
    'terminal_vendor_nedbank_enabled',
    'Nedbank terminal integration',
    'Allow providers to connect Nedbank merchant terminal. Requires terminal_integrations_enabled.',
    false
  ),
  (
    'terminal_vendor_absa_enabled',
    'Absa terminal integration',
    'Allow providers to connect Absa merchant terminal. Requires terminal_integrations_enabled.',
    false
  ),
  (
    'terminal_vendor_standard_bank_enabled',
    'Standard Bank terminal integration',
    'Allow providers to connect Standard Bank merchant terminal. Requires terminal_integrations_enabled.',
    false
  )
) AS t(key, name, descr, enabled_default)
WHERE NOT EXISTS (
  SELECT 1 FROM public.feature_flags ff
  WHERE ff.feature_key = t.key AND ff.tenant_id IS NULL
);
