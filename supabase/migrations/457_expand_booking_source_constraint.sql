-- ============================================================================
-- Migration 457: Expand booking_source CHECK to include 'provider'
-- ============================================================================
-- Migration 179 defined CHECK (booking_source IN ('online', 'walk_in')).
-- Provider-created bookings (non-walk-in) need 'provider' as a valid source
-- to distinguish from customer-initiated 'online' bookings in reporting,
-- commission, and payout calculations.
-- ============================================================================

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_booking_source_check;

ALTER TABLE bookings ADD CONSTRAINT bookings_booking_source_check
  CHECK (booking_source IN ('online', 'walk_in', 'provider'));

COMMENT ON COLUMN bookings.booking_source IS
  'Source of booking: "online" (customer portal), "walk_in" (provider walk-in), or "provider" (provider-created on behalf of customer). Platform fees apply only to online bookings.';
