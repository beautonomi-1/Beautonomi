-- Add deactivated_by to distinguish self-service vs admin deactivation (for reactivation flow).
-- 'user' = self-service deactivation (user can reactivate by logging in); 'admin' = deactivated by super admin.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS deactivated_by TEXT;

COMMENT ON COLUMN public.users.deactivated_by IS 'Who deactivated: user (self-service, can reactivate) or admin (super admin).';
