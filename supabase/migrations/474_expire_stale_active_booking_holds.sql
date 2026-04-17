-- One-time cleanup for stale active booking holds.
-- These rows can block new inserts via overlap exclusion constraints even when already past expiry.
UPDATE booking_holds
SET hold_status = 'expired'
WHERE hold_status = 'active'
  AND expires_at < NOW();
