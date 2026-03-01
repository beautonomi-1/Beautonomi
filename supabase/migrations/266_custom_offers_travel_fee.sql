-- Allow optional travel fee on custom offers for at_home (house calls)
ALTER TABLE custom_offers
  ADD COLUMN IF NOT EXISTS travel_fee NUMERIC(10, 2) DEFAULT 0 CHECK (travel_fee >= 0);

COMMENT ON COLUMN custom_offers.travel_fee IS 'Optional travel fee for at_home offers. Applied to the booking when the offer is accepted and paid.';
