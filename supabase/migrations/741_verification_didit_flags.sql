-- Migration 741: Verification feature flags — Didit
--
-- Adds Didit feature flags, migrates values from verification.sumsub.*,
-- and adds the new accuracy flags (cross_validate, min_age, dedupe).

-- 1. verification.didit.enabled (master switch)
INSERT INTO feature_flags (
  feature_key, feature_name, description, enabled, category
)
VALUES (
  'verification.didit.enabled',
  'Didit identity verification',
  'Master switch for Didit-automated KYC. Availability = this flag AND DIDIT_API_KEY + DIDIT_WORKFLOW_ID + DIDIT_WEBHOOK_SECRET env vars present.',
  false,  -- off until provisioned; enable in staging after setting env
  'control_plane'
)
ON CONFLICT (feature_key) WHERE tenant_id IS NULL DO NOTHING;

-- 2. verification.didit.required_for_payouts (migrated from sumsub)
INSERT INTO feature_flags (
  feature_key, feature_name, description, enabled, category
)
SELECT
  'verification.didit.required_for_payouts',
  'Identity required for payouts',
  'When enabled, POST /api/provider/payouts is blocked until the provider has approved identity verification.',
  enabled,
  'control_plane'
FROM feature_flags
WHERE feature_key = 'verification.sumsub.required_for_payouts'
  AND tenant_id IS NULL
LIMIT 1
ON CONFLICT (feature_key) WHERE tenant_id IS NULL DO NOTHING;

-- Fallback: insert disabled if no sumsub row exists
INSERT INTO feature_flags (feature_key, feature_name, description, enabled, category)
VALUES (
  'verification.didit.required_for_payouts',
  'Identity required for payouts',
  'When enabled, POST /api/provider/payouts is blocked until the provider has approved identity verification.',
  false,
  'control_plane'
)
ON CONFLICT (feature_key) WHERE tenant_id IS NULL DO NOTHING;

-- 3. verification.didit.cross_validate (accuracy booster)
INSERT INTO feature_flags (
  feature_key, feature_name, description, enabled, category
)
VALUES (
  'verification.didit.cross_validate',
  'Didit cross-validation',
  'When enabled, pass confirm-legal-details form values as expected_details to Didit. Name/DOB mismatch routes to pending_review for human review.',
  true,
  'control_plane'
)
ON CONFLICT (feature_key) WHERE tenant_id IS NULL DO NOTHING;

-- 4. verification.min_age (eligibility, stored as string value)
INSERT INTO feature_flags (
  feature_key, feature_name, description, enabled, category, metadata
)
VALUES (
  'verification.min_age',
  'Minimum age for verification',
  'Minimum age (years) derived from verified date_of_birth. Under-age approvals are flagged for superadmin review.',
  true,
  'control_plane',
  '{"min_age": 18}'::jsonb
)
ON CONFLICT (feature_key) WHERE tenant_id IS NULL DO NOTHING;

-- 5. verification.dedupe (duplicate identity detection)
INSERT INTO feature_flags (
  feature_key, feature_name, description, enabled, category
)
VALUES (
  'verification.dedupe',
  'Duplicate identity detection',
  'When enabled, detect when the same verified identity is already approved on another account and raise a fraud-review flag.',
  true,
  'control_plane'
)
ON CONFLICT (feature_key) WHERE tenant_id IS NULL DO NOTHING;

-- 6. Migrate per-tenant sumsub.required_for_payouts -> didit equivalent
INSERT INTO feature_flags (
  feature_key, feature_name, description, enabled, category, tenant_id
)
SELECT
  'verification.didit.required_for_payouts',
  'Identity required for payouts',
  'Per-tenant override.',
  enabled,
  'control_plane',
  tenant_id
FROM feature_flags
WHERE feature_key = 'verification.sumsub.required_for_payouts'
  AND tenant_id IS NOT NULL
ON CONFLICT DO NOTHING;
