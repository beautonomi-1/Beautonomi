-- Master platform/tenant gate for provider-side Yoco payments and management.
--
-- `yoco_oauth_v2` remains the narrower rollout flag for the OAuth Web POS flow.
-- This flag controls all provider-facing Yoco surfaces: integration settings,
-- devices, terminal/hosted checkout payments, and setup prompts.

INSERT INTO public.feature_flags (feature_key, feature_name, description, enabled, category)
SELECT
    'payment_yoco',
    'Yoco provider payments',
    'Enable provider-side Yoco payment management and collection, including terminals, hosted checkout links, and QR payments. Disable to hide Yoco as a provider payment method.',
    true,
    'payments'
WHERE NOT EXISTS (
    SELECT 1
    FROM public.feature_flags
    WHERE feature_key = 'payment_yoco'
      AND tenant_id IS NULL
);
