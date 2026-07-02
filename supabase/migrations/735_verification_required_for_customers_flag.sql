-- Migration 735: Seed verification.required_for_customers feature flag
--
-- Adds the flag that controls whether customers must have approved identity
-- verification before their first booking is created.
--
-- Inserted with enabled = false so existing deployments are unaffected on
-- deploy. Superadmins can toggle it from Control plane → Integrations → Sumsub
-- in the "Verification requirements" section.

INSERT INTO feature_flags (
  feature_key,
  feature_name,
  description,
  enabled,
  category
)
VALUES (
  'verification.required_for_customers',
  'Customer first-booking verification',
  'When enabled, customers must have approved identity verification before their first booking is created. Subsequent bookings are not re-checked. Controlled from Control plane → Integrations → Sumsub.',
  false,
  'control_plane'
)
ON CONFLICT (feature_key) WHERE tenant_id IS NULL DO UPDATE
  SET description = EXCLUDED.description;
