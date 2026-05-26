-- Public customers should see the first real available slot unless the provider
-- explicitly adds a minimum lead-time policy.

ALTER TABLE provider_online_booking_settings
  ALTER COLUMN min_notice_minutes SET DEFAULT 0;

-- Rows created by the old table default are indistinguishable from an explicit
-- 60-minute choice unless they were never changed after insert. Only normalize
-- those untouched default rows; providers with 120 minutes or later edits keep
-- their configured policy.
UPDATE provider_online_booking_settings
SET min_notice_minutes = 0,
    updated_at = NOW()
WHERE min_notice_minutes = 60
  AND (
    updated_at IS NULL
    OR updated_at <= created_at + INTERVAL '10 minutes'
  );
