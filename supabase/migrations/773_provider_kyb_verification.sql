-- Migration 773: Provider KYB verification (Didit business sessions)
--
-- Extends identity_verification_sessions with session_kind (user KYC vs business KYB),
-- adds provider KYB denormalized status, and business registration country.

ALTER TABLE identity_verification_sessions
  ADD COLUMN IF NOT EXISTS session_kind TEXT NOT NULL DEFAULT 'user'
    CHECK (session_kind IN ('user', 'business')),
  ADD COLUMN IF NOT EXISTS didit_business_id TEXT,
  ADD COLUMN IF NOT EXISTS business_snapshot JSONB DEFAULT '{}'::jsonb;

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS business_registration_country TEXT,
  ADD COLUMN IF NOT EXISTS kyb_verification_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (kyb_verification_status IN (
      'not_started',
      'in_progress',
      'pending_review',
      'approved',
      'rejected',
      'expired',
      'not_required'
    ));

COMMENT ON COLUMN identity_verification_sessions.session_kind IS
  'user = person KYC; business = registered company KYB (Didit business verification workflow).';
COMMENT ON COLUMN providers.kyb_verification_status IS
  'Denormalized KYB outcome for gates. not_required when payee_kind=individual or KYB disabled.';

-- Replace provider one-active-session index with session_kind-aware indexes.
DROP INDEX IF EXISTS idx_ivs_one_active_provider;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ivs_one_active_provider_kyc
  ON identity_verification_sessions (provider_id)
  WHERE persona_type = 'provider'
    AND provider_id IS NOT NULL
    AND session_kind = 'user'
    AND status NOT IN ('approved','rejected','expired','abandoned','errored');

CREATE UNIQUE INDEX IF NOT EXISTS idx_ivs_one_active_provider_kyb
  ON identity_verification_sessions (provider_id)
  WHERE persona_type = 'provider'
    AND provider_id IS NOT NULL
    AND session_kind = 'business'
    AND status NOT IN ('approved','rejected','expired','abandoned','errored');

CREATE INDEX IF NOT EXISTS idx_ivs_session_kind
  ON identity_verification_sessions (session_kind, persona_type, status);

-- Feature flags for KYB (defaults off — superadmin enables via Control Plane).
-- Use NOT EXISTS: global uniqueness is a partial unique index on (feature_key) WHERE tenant_id IS NULL.
INSERT INTO feature_flags (feature_key, feature_name, description, enabled, category)
SELECT
  'verification.didit.kyb.enabled',
  'Didit KYB (business verification)',
  'When on with Didit KYC, registered business providers can verify their company via Didit KYB.',
  false,
  'control_plane'
WHERE NOT EXISTS (
  SELECT 1 FROM feature_flags
  WHERE feature_key = 'verification.didit.kyb.enabled' AND tenant_id IS NULL
);

INSERT INTO feature_flags (feature_key, feature_name, description, enabled, category)
SELECT
  'verification.didit.kyb.required_for_business',
  'KYB required for business providers',
  'When on, registered business providers must complete KYB (in addition to person KYC) for go-live/payout gates.',
  false,
  'control_plane'
WHERE NOT EXISTS (
  SELECT 1 FROM feature_flags
  WHERE feature_key = 'verification.didit.kyb.required_for_business' AND tenant_id IS NULL
);
