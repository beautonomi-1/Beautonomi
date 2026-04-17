-- Align monetization model to customer-paid platform fee.
-- Policy:
-- 1) Customer-facing platform fee remains enabled via platform_service_fee_* settings.
-- 2) Provider commission is disabled unless explicitly re-enabled later.
-- 3) Provider-level fee/commission overrides are cleared to avoid hidden divergence.

-- Disable provider commission globally in active platform settings.
update platform_settings
set settings = jsonb_set(
  jsonb_set(
    coalesce(settings, '{}'::jsonb),
    '{payouts,commission_enabled}',
    'false'::jsonb,
    true
  ),
  '{payouts,platform_commission_percentage}',
  '0'::jsonb,
  true
)
where is_active = true;

-- Ensure customer-paid platform fee remains visible/explicit at checkout.
update platform_settings
set settings = jsonb_set(
  coalesce(settings, '{}'::jsonb),
  '{payouts,show_service_fee_to_customer}',
  'true'::jsonb,
  true
)
where is_active = true;

-- Remove provider-level fee override so pricing follows platform policy.
update providers
set customer_fee_config_id = null
where customer_fee_config_id is not null;

-- Remove provider-level commission overrides (commission is disabled globally above).
update providers
set commission_override = null
where commission_override is not null;
