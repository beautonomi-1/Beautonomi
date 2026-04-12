-- Track when DB subscription tier was changed by admin but Paystack billing may need follow-up.
ALTER TABLE public.provider_subscriptions
  ADD COLUMN IF NOT EXISTS paystack_sync_pending BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.provider_subscriptions
  ADD COLUMN IF NOT EXISTS paystack_sync_note TEXT;

COMMENT ON COLUMN public.provider_subscriptions.paystack_sync_pending IS
  'True when an admin override changed the plan and Paystack was cancelled or could not be aligned; provider may need to complete billing in-app.';
COMMENT ON COLUMN public.provider_subscriptions.paystack_sync_note IS
  'Human-readable note for admins (e.g. Paystack cancelled, or disable failed).';
