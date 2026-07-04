-- Migration 760: Didit go-live flag repair
--
-- 1. Ensures all verification flags used by Control plane → Integrations → Didit exist.
-- 2. Applies a Didit-ready global configuration so automated KYC can be tested
--    once DIDIT_API_KEY, DIDIT_WORKFLOW_ID, and DIDIT_WEBHOOK_SECRET are set in Vercel.
--
-- Enforcement: customer first-booking verification ON. Provider go-live and payout
-- gates stay OFF until you enable them from the admin Didit page.

-- ── 1. Seed missing global flag rows ─────────────────────────────────────────

INSERT INTO feature_flags (feature_key, feature_name, description, enabled, category)
VALUES
  (
    'verification.didit.enabled',
    'Didit identity verification',
    'Master switch for Didit-automated KYC. Availability = this flag AND DIDIT_API_KEY + DIDIT_WORKFLOW_ID + DIDIT_WEBHOOK_SECRET env vars present.',
    false,
    'control_plane'
  ),
  (
    'verification.manual.enabled',
    'Manual verification',
    'Allow users to upload identity documents for manual admin review.',
    true,
    'control_plane'
  ),
  (
    'verification.didit.required_for_payouts',
    'Identity required for payouts',
    'When enabled, POST /api/provider/payouts is blocked until the provider has approved identity verification.',
    false,
    'control_plane'
  ),
  (
    'verification.required_for_customers',
    'Customer first-booking verification',
    'When enabled, customers must have approved identity verification before their first booking is created.',
    true,
    'control_plane'
  ),
  (
    'verification.didit.cross_validate',
    'Didit cross-validation',
    'When enabled, pass confirm-legal-details form values as expected_details to Didit. Name/DOB mismatch routes to pending_review.',
    true,
    'control_plane'
  ),
  (
    'verification.dedupe',
    'Duplicate identity detection',
    'When enabled, detect when the same verified identity is already approved on another account and raise a fraud-review flag.',
    true,
    'control_plane'
  ),
  (
    'provider_verification',
    'Provider Verification',
    'Require identity verification for providers before go-live.',
    false,
    'provider'
  )
ON CONFLICT (feature_key) WHERE tenant_id IS NULL DO NOTHING;

INSERT INTO feature_flags (feature_key, feature_name, description, enabled, category, metadata)
VALUES (
  'verification.min_age',
  'Minimum age for verification',
  'Minimum age (years) derived from verified date_of_birth. Under-age approvals are flagged for superadmin review.',
  true,
  'control_plane',
  '{"min_age": 18}'::jsonb
)
ON CONFLICT (feature_key) WHERE tenant_id IS NULL DO NOTHING;

-- ── 2. Didit-ready global configuration (testing / smoke-test safe) ──────────

-- Master switch ON — effective Didit availability still requires Vercel env vars.
UPDATE feature_flags
SET
  enabled = true,
  description = 'Master switch for Didit-automated KYC. Availability = this flag AND DIDIT_API_KEY + DIDIT_WORKFLOW_ID + DIDIT_WEBHOOK_SECRET env vars present.',
  updated_at = NOW()
WHERE feature_key = 'verification.didit.enabled'
  AND tenant_id IS NULL;

-- Manual fallback ON (Didit primary + manual = "both" mode in admin UI).
UPDATE feature_flags
SET enabled = true, updated_at = NOW()
WHERE feature_key = 'verification.manual.enabled'
  AND tenant_id IS NULL;

-- Accuracy flags ON.
UPDATE feature_flags
SET enabled = true, updated_at = NOW()
WHERE feature_key IN (
  'verification.didit.cross_validate',
  'verification.dedupe',
  'verification.min_age'
)
AND tenant_id IS NULL;

-- Customer first-booking verification ON (Didit + manual both available via "both" mode).
UPDATE feature_flags
SET enabled = true, updated_at = NOW()
WHERE feature_key = 'verification.required_for_customers'
  AND tenant_id IS NULL;

-- Provider / payout enforcement OFF until explicitly enabled in admin.
UPDATE feature_flags
SET enabled = false, updated_at = NOW()
WHERE feature_key IN (
  'verification.didit.required_for_payouts',
  'provider_verification'
)
AND tenant_id IS NULL;

-- Legacy Sumsub flags OFF (Sumsub removed; Didit replaces it).
UPDATE feature_flags
SET
  enabled = false,
  description = COALESCE(
    description,
    'Deprecated — Sumsub removed. Use verification.didit.enabled instead.'
  ),
  updated_at = NOW()
WHERE feature_key IN (
  'verification.sumsub.enabled',
  'verification.sumsub.required_for_payouts'
)
AND tenant_id IS NULL;
