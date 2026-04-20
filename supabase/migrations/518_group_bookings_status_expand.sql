-- Align group_bookings.status with provider portal + mobile (booked, started).
ALTER TABLE public.group_bookings DROP CONSTRAINT IF EXISTS group_bookings_status_check;

ALTER TABLE public.group_bookings
  ADD CONSTRAINT group_bookings_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'pending',
        'confirmed',
        'booked',
        'started',
        'completed',
        'cancelled'
      ]::text[]
    )
  );
