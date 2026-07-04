-- Migration 742: Expand provider_verification_status + mark legacy Sumsub read-only
--
-- 1. Adds 'expired' and 'abandoned' to the provider_verification_status status column.
-- 2. Marks user_verifications rows with document_type='sumsub' as legacy/read-only
--    by adding a provider discriminator column.
-- 3. Adds provider_session_id (Didit) to provider_verification_status.

-- 1. Expand status CHECK constraint (Postgres: drop + recreate)
DO $$
BEGIN
  -- Drop old check if it exists
  ALTER TABLE provider_verification_status
    DROP CONSTRAINT IF EXISTS provider_verification_status_status_check;
EXCEPTION WHEN others THEN NULL;
END$$;

ALTER TABLE provider_verification_status
  ADD CONSTRAINT provider_verification_status_status_check
  CHECK (status IN (
    'not_started',
    'pending',
    'in_progress',
    'under_review',
    'approved',
    'rejected',
    'expired',
    'abandoned'
  ));

-- 2. Add Didit session id to provider_verification_status for correlation
ALTER TABLE provider_verification_status
  ADD COLUMN IF NOT EXISTS didit_session_id TEXT,
  ADD COLUMN IF NOT EXISTS verification_provider TEXT DEFAULT 'sumsub';

-- Index for Didit correlation
CREATE INDEX IF NOT EXISTS idx_pvs_didit_session_id
  ON provider_verification_status(didit_session_id)
  WHERE didit_session_id IS NOT NULL;

-- 3. Add legacy discriminator to user_verifications
ALTER TABLE user_verifications
  ADD COLUMN IF NOT EXISTS is_legacy_sumsub BOOLEAN
    GENERATED ALWAYS AS (document_type = 'sumsub') STORED;

-- 4. Add Didit session id to user_verifications
ALTER TABLE user_verifications
  ADD COLUMN IF NOT EXISTS didit_session_id TEXT;

COMMENT ON COLUMN provider_verification_status.didit_session_id IS
  'Didit session id for Didit-sourced verifications. NULL for legacy Sumsub rows.';
COMMENT ON COLUMN provider_verification_status.verification_provider IS
  'sumsub (legacy) or didit.';
COMMENT ON COLUMN user_verifications.is_legacy_sumsub IS
  'True for legacy Sumsub-sourced verification rows (read-only history).';
