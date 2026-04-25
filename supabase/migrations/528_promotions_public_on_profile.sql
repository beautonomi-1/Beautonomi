-- Providers can decide whether a promo is visible on public profile cards.
-- This only affects profile display, not promo validity at checkout.

ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS public_on_profile BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN promotions.public_on_profile IS
  'When true, the promo code can be shown on the public provider profile. False hides it from profile display only.';
