-- Migration 725: Wire verification feature flags
--
-- Before this migration the flags verification.sumsub.enabled,
-- verification.sumsub.required_for_payouts, and provider_verification were
-- seeded but never read by application code ("unwired").  This migration:
--
--   1. Seeds verification.manual.enabled = true (manual upload was always on —
--      preserve that behaviour on deploy).
--   2. Backfills verification.sumsub.enabled = true wherever the corresponding
--      sumsub_integration_config row already had enabled = true, so live
--      environments keep Sumsub working after the code change is deployed.
--      Both global rows (tenant_id IS NULL) and per-tenant rows are handled.
--
-- The flags are then enforced by resolveVerificationPolicy() in
-- apps/web/src/lib/verification/verification-policy.ts.

-- 1. Insert verification.manual.enabled if it does not already exist.
INSERT INTO feature_flags (
  feature_key,
  feature_name,
  description,
  enabled,
  category
)
VALUES (
  'verification.manual.enabled',
  'Manual verification',
  'Allow users to upload identity documents for manual admin review. When disabled, POST /api/me/verification returns 403.',
  true,
  'control_plane'
)
ON CONFLICT (feature_key) WHERE tenant_id IS NULL DO UPDATE
  SET description = EXCLUDED.description;

-- 2a. Backfill global verification.sumsub.enabled from sumsub_integration_config
--     where the global row (tenant_id IS NULL) had enabled = true.
UPDATE feature_flags
SET enabled = true
WHERE feature_key = 'verification.sumsub.enabled'
  AND tenant_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM sumsub_integration_config
    WHERE tenant_id IS NULL
      AND enabled = true
    LIMIT 1
  );

-- If the flag row does not yet exist but the config row does, insert it enabled.
INSERT INTO feature_flags (
  feature_key,
  feature_name,
  description,
  enabled,
  category
)
SELECT
  'verification.sumsub.enabled',
  'Sumsub verification',
  'Use Sumsub SDK for provider/customer verification. Requires credentials in Control plane → Integrations → Sumsub. Sumsub availability = this flag AND credentials present.',
  true,
  'control_plane'
FROM sumsub_integration_config
WHERE tenant_id IS NULL
  AND enabled = true
LIMIT 1
ON CONFLICT (feature_key) WHERE tenant_id IS NULL DO NOTHING;

-- 2b. Backfill per-tenant rows: for each tenant_id in sumsub_integration_config
--     that has enabled = true, ensure a feature_flags row with that tenant_id
--     is also enabled = true.
INSERT INTO feature_flags (
  feature_key,
  feature_name,
  description,
  enabled,
  category,
  tenant_id
)
SELECT
  'verification.sumsub.enabled',
  'Sumsub verification',
  'Per-tenant Sumsub on/off override.',
  true,
  'control_plane',
  s.tenant_id
FROM sumsub_integration_config s
WHERE s.tenant_id IS NOT NULL
  AND s.enabled = true
ON CONFLICT DO NOTHING;

-- Update existing per-tenant rows where sumsub config is enabled.
UPDATE feature_flags ff
SET enabled = true
FROM sumsub_integration_config s
WHERE ff.feature_key = 'verification.sumsub.enabled'
  AND ff.tenant_id = s.tenant_id
  AND s.enabled = true;
