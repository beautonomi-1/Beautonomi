-- Add location_id to custom_offers for at_salon bookings.
-- When an offer is accepted and converted to a booking, this venue is used.
ALTER TABLE custom_offers
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES provider_locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_custom_offers_location ON custom_offers(location_id) WHERE location_id IS NOT NULL;

COMMENT ON COLUMN custom_offers.location_id IS 'For at_salon: venue where the appointment will take place. Used when creating the booking after payment.';
