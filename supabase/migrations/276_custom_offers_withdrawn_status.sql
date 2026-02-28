-- Allow providers to retract (withdraw) a custom offer before it is accepted/paid.
ALTER TABLE custom_offers
  DROP CONSTRAINT IF EXISTS custom_offers_status_check;

ALTER TABLE custom_offers
  ADD CONSTRAINT custom_offers_status_check
  CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'payment_pending', 'paid', 'withdrawn'));

COMMENT ON COLUMN custom_offers.status IS 'pending, accepted, declined, expired, payment_pending, paid, withdrawn (provider retracted)';
