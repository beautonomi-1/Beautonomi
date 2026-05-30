-- Ensure Paystack Virtual Terminal flag resolves on both provider web portal and native app.
-- Some environments may have platforms_allowed set to provider-only, which hides the feature
-- in provider web (ConfigBundle platform=web) while admin shows enabled=true.

UPDATE public.feature_flags
SET platforms_allowed = ARRAY['web', 'provider', 'customer']::text[]
WHERE feature_key = 'payment_paystack_virtual_terminal'
  AND tenant_id IS NULL
  AND (
    platforms_allowed IS NULL
    OR NOT (platforms_allowed @> ARRAY['web']::text[] AND platforms_allowed @> ARRAY['provider']::text[])
  );
