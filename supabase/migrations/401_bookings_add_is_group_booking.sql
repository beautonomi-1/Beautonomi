-- create_booking_with_locking inserts is_group_booking (see 136 / 273) but the column was never added here.
-- Fixes: column "is_group_booking" of relation "bookings" does not exist (42703).

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS is_group_booking BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bookings.is_group_booking IS 'True when this booking uses the group-participants flow.';
