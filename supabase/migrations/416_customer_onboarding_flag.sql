-- Track when a customer completed the post-signup onboarding wizard.
-- NULL means the wizard has not yet been completed.
-- Used by /api/me/onboarding/complete (server) and the onboarding guard
-- in both the web layout and the mobile (app)/_layout.tsx.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS customer_onboarding_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.customer_onboarding_completed_at IS
  'Timestamp set when the customer finishes the post-signup onboarding wizard. NULL = not yet done.';
