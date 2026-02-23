-- Link bookings to provider referral sources (where did this client come from?).
-- Enables "referral_received" automation and provider attribution reporting.
-- Distinct from the platform customer referral program (invite friends → wallet reward).
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS referral_source_id UUID REFERENCES referral_sources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_referral_source_id
  ON bookings(referral_source_id) WHERE referral_source_id IS NOT NULL;

COMMENT ON COLUMN bookings.referral_source_id IS 'Provider-defined source (e.g. Instagram, Friend) for attribution; used by referral_received automation.';
