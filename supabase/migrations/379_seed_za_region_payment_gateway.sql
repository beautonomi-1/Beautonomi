-- Primary online gateway for ZA region (Paystack). Enables region_payment_gateways lookups per GLOBAL_EXPANSION_GUIDE.
-- Secrets stay in region_secrets / tenant_secrets / env; this row is routing metadata only.

INSERT INTO public.region_payment_gateways (region_id, gateway, config, is_primary_online, is_primary_pos, is_active)
SELECT
  r.id,
  'paystack',
  jsonb_build_object(
    'supported_currencies', jsonb_build_array('ZAR'),
    'label', 'Paystack'
  ),
  true,
  false,
  true
FROM public.regions r
WHERE r.code = 'ZA'
  AND r.is_active = true
ON CONFLICT (region_id, gateway) DO UPDATE SET
  config = EXCLUDED.config,
  is_primary_online = EXCLUDED.is_primary_online,
  is_active = EXCLUDED.is_active,
  updated_at = now();
