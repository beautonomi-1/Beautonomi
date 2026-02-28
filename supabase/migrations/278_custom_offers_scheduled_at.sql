-- Optional appointment time for the offer. When set, used as booking scheduled_at when offer is paid.
ALTER TABLE custom_offers
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN custom_offers.scheduled_at IS 'Proposed appointment start time. When offer is accepted and paid, this becomes the booking scheduled_at (falls back to request preferred_start_at if null).';
