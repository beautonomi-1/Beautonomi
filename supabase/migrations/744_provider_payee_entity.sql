-- Migration 744: Provider payee entity model + payout-name match status
--
-- Supports entity-aware payout-name consistency checking (plan section 3C).
-- Didit KYC always verifies a natural person; the payout bank account may
-- legitimately be in a different name (registered business).  This model
-- captures that distinction and the computed match result.
--
-- All warnings are advisory only — never a hard payout block.

-- 1. Payee model on providers
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS payee_kind TEXT
    DEFAULT 'individual'
    CHECK (payee_kind IN ('individual', 'business')),
  ADD COLUMN IF NOT EXISTS registered_business_name    TEXT,
  ADD COLUMN IF NOT EXISTS business_registration_number TEXT,
  ADD COLUMN IF NOT EXISTS verified_person_role        TEXT
    CHECK (verified_person_role IN ('owner', 'authorized_representative'));

-- Default payee_kind from existing business_type
UPDATE providers
  SET payee_kind = CASE
    WHEN business_type = 'freelancer' THEN 'individual'
    ELSE 'business'
  END
WHERE payee_kind IS NULL OR payee_kind = 'individual';

-- 2. Payout-name match status on provider_payout_accounts
ALTER TABLE provider_payout_accounts
  ADD COLUMN IF NOT EXISTS name_match_status TEXT
    CHECK (name_match_status IN (
      'match_ok',
      'business_name_match',
      'owner_fallback_match',
      'needs_review',
      'mismatch'
    )),
  ADD COLUMN IF NOT EXISTS name_match_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS name_match_notes TEXT;

-- Superadmin review flag (payout-name needs human review)
CREATE INDEX IF NOT EXISTS idx_ppa_name_match_review
  ON provider_payout_accounts(provider_id, name_match_status)
  WHERE name_match_status IN ('needs_review', 'mismatch');

COMMENT ON COLUMN providers.payee_kind IS
  'individual (freelancer/sole trader) or business (registered company). Determines which name to match the payout account against.';
COMMENT ON COLUMN providers.registered_business_name IS
  'Provider-declared (not KYB-verified) registered business/legal entity name.';
COMMENT ON COLUMN providers.business_registration_number IS
  'Provider-declared business registration number (CIPC or equivalent). Advisory only.';
COMMENT ON COLUMN providers.verified_person_role IS
  'Role of the KYC-verified person relative to the business: owner or authorized_representative.';
COMMENT ON COLUMN provider_payout_accounts.name_match_status IS
  'Computed advisory payout-name consistency result. Never a hard block.';
