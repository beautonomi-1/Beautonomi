-- Stripe Connect Express account id per provider (Stripe regions).

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;

CREATE INDEX IF NOT EXISTS idx_providers_stripe_connect_account
  ON public.providers(stripe_connect_account_id)
  WHERE stripe_connect_account_id IS NOT NULL;

COMMENT ON COLUMN public.providers.stripe_connect_account_id IS
  'Stripe Connect Express account id for destination-charge payouts in Stripe regions.';
