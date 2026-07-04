-- Migration 743: Verified legal identity columns on users
--
-- Stores PII-minimised authoritative identity extracted from the verified
-- document (NOT from user-supplied form data).  Display name is kept separate
-- and is never overwritten by these columns.
--
-- POPIA/GDPR lawful basis: fraud prevention / regulatory KYC.
-- Retention: defined by platform privacy policy; these columns are included in
-- data-subject deletion/export procedures.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS legal_first_name           TEXT,
  ADD COLUMN IF NOT EXISTS legal_last_name            TEXT,
  ADD COLUMN IF NOT EXISTS legal_date_of_birth        DATE,
  ADD COLUMN IF NOT EXISTS legal_nationality          TEXT,    -- ISO 3166-1 alpha-3
  ADD COLUMN IF NOT EXISTS legal_id_document_type     TEXT,    -- e.g. 'PASSPORT', 'ID_CARD'
  ADD COLUMN IF NOT EXISTS legal_id_document_country  TEXT,    -- ISO 3166-1 alpha-2 issuing country
  ADD COLUMN IF NOT EXISTS legal_identity_source      TEXT,    -- 'didit' | 'sumsub' (legacy)
  ADD COLUMN IF NOT EXISTS legal_identity_verified_at TIMESTAMPTZ,

  -- Superadmin-only review flags
  ADD COLUMN IF NOT EXISTS name_mismatch_flag         BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS name_mismatch_resolved     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS identity_dedupe_flag       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS identity_dedupe_resolved   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS under_age_flag             BOOLEAN DEFAULT false;

-- Index for superadmin flag review queries
CREATE INDEX IF NOT EXISTS idx_users_name_mismatch_flag
  ON users(name_mismatch_flag)
  WHERE name_mismatch_flag = true AND name_mismatch_resolved = false;

CREATE INDEX IF NOT EXISTS idx_users_identity_dedupe_flag
  ON users(identity_dedupe_flag)
  WHERE identity_dedupe_flag = true AND identity_dedupe_resolved = false;

COMMENT ON COLUMN users.legal_first_name IS
  'Authoritative legal first name extracted from verified document (not user-supplied display name).';
COMMENT ON COLUMN users.legal_last_name IS
  'Authoritative legal last name extracted from verified document.';
COMMENT ON COLUMN users.legal_date_of_birth IS
  'Verified date of birth from document. Used for age-eligibility check only; never surfaced to other users.';
COMMENT ON COLUMN users.legal_nationality IS
  'ISO 3166-1 alpha-3 nationality from verified document.';
COMMENT ON COLUMN users.name_mismatch_flag IS
  'True when confirmed legal details did not match document-extracted details. Superadmin-only visibility.';
COMMENT ON COLUMN users.identity_dedupe_flag IS
  'True when this identity was already verified on another account. Fraud-review signal. Superadmin-only.';
