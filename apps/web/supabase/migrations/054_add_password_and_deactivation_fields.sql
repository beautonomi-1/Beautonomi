-- Add password_changed_at, deactivated_at, and deactivation_reason to users table

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deactivation_reason TEXT;

-- Add index for deactivated_at for efficient queries
CREATE INDEX IF NOT EXISTS idx_users_deactivated_at ON public.users(deactivated_at) WHERE deactivated_at IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.users.password_changed_at IS 'Timestamp when the user last changed their password';
COMMENT ON COLUMN public.users.deactivated_at IS 'Timestamp when the user account was deactivated';
COMMENT ON COLUMN public.users.deactivation_reason IS 'Optional reason provided by the user for deactivating their account';
