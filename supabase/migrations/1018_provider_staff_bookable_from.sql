-- When set, staff is hidden from public online booking until this date (provider timezone).
ALTER TABLE provider_staff
  ADD COLUMN IF NOT EXISTS bookable_from DATE;

COMMENT ON COLUMN provider_staff.bookable_from IS
  'First calendar date (provider TZ) the member may appear in public online booking. NULL = no start restriction.';
