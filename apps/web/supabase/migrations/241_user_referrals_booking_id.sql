-- Add optional booking_id to user_referrals for attribution (first-booking conversion).
-- Referral is recorded when a referred user completes a booking; booking_id links the conversion.
ALTER TABLE user_referrals
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_referrals_booking_id ON user_referrals(booking_id) WHERE booking_id IS NOT NULL;

COMMENT ON COLUMN user_referrals.booking_id IS 'Booking that triggered the referral conversion (first booking by referred user).';
