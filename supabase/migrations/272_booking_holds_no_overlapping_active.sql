-- Prevent concurrent hold creation from double-booking the same slot.
-- Only one active hold can exist per (staff or provider) and time range.
-- Predicate uses only hold_status (no expires_at > now()) so it stays IMMUTABLE;
-- rely on app/job to set hold_status = 'expired' when a hold expires.
-- Requires btree_gist for EXCLUDE with uuid + tstzrange.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Per-staff: no two active non-expired holds for the same staff with overlapping time (staff_id set)
ALTER TABLE booking_holds
  ADD CONSTRAINT booking_holds_no_overlap_staff
  EXCLUDE USING gist (
    staff_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  )
  WHERE (hold_status = 'active' AND staff_id IS NOT NULL);

-- Per-provider (anyone mode): no two active non-expired holds for same provider with overlapping time when staff_id is null
-- Use a separate constraint so staff_id IS NULL rows are keyed by provider_id
ALTER TABLE booking_holds
  ADD CONSTRAINT booking_holds_no_overlap_provider_anyone
  EXCLUDE USING gist (
    provider_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  )
  WHERE (hold_status = 'active' AND staff_id IS NULL);
