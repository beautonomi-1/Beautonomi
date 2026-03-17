-- Add is_primary to provider_payout_accounts so providers can mark one account as default for payouts.
-- Mobile app uses this for "Set as primary" and to block deleting the primary account.

ALTER TABLE provider_payout_accounts
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false;

-- Set one account per provider as primary (oldest non-deleted by created_at)
UPDATE provider_payout_accounts p
SET is_primary = true
FROM (
  SELECT DISTINCT ON (provider_id) id
  FROM provider_payout_accounts
  WHERE deleted_at IS NULL
  ORDER BY provider_id, created_at ASC
) first_per_provider
WHERE p.id = first_per_provider.id;

-- Ensure only one primary per provider (constraint: unique partial index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_payout_accounts_one_primary
  ON provider_payout_accounts(provider_id)
  WHERE is_primary = true AND deleted_at IS NULL;

COMMENT ON COLUMN provider_payout_accounts.is_primary IS 'Default bank account for payouts when no bank_account_id is specified. One per provider.';
