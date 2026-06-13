-- Shadow / guest customer accounts (provider-created walk-ins awaiting claim)

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_shadow boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_users_is_shadow
  ON public.users (is_shadow)
  WHERE is_shadow = true;

COMMENT ON COLUMN public.users.is_shadow IS
  'True for provider-created walk-in customers not yet claimed by the real person.';
COMMENT ON COLUMN public.users.claimed_at IS
  'When the customer completed account claim (set password / verified identity).';

-- Backfill placeholder-email walk-ins
UPDATE public.users
SET is_shadow = true
WHERE is_shadow = false
  AND (
    email ILIKE '%@beautonomi.invalid'
    OR email ILIKE '%@beautonomi.local'
  );
