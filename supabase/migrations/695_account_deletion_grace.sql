-- Deferred self-service account deletion: purge runs after account_deletion_purge_after_at.
-- Uses existing account_deletion_requested_at (057_privacy_settings.sql).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS account_deletion_purge_after_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.account_deletion_purge_after_at IS
  'When cron may permanently purge this account (self-service deletion grace period).';

CREATE INDEX IF NOT EXISTS idx_users_account_deletion_purge_after
  ON public.users (account_deletion_purge_after_at)
  WHERE account_deletion_purge_after_at IS NOT NULL
    AND deactivated_by = 'pending_deletion';
