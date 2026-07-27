-- Backfill group_bookings location + pending status from child bookings so provider
-- nav badges, Overview stats, and the bookings list stay aligned.

-- Copy location from the primary child booking when the group row is missing it.
UPDATE public.group_bookings gb
SET
  location_id = COALESCE(gb.location_id, b.location_id),
  location_type = COALESCE(NULLIF(gb.location_type, ''), b.location_type::text, 'at_salon'),
  updated_at = NOW()
FROM public.bookings b
WHERE b.group_booking_id = gb.id
  AND b.id = gb.primary_contact_booking_id
  AND (gb.location_id IS NULL OR gb.location_type IS NULL OR gb.location_type = '');

-- Fallback: any child booking when primary_contact_booking_id is unset.
UPDATE public.group_bookings gb
SET
  location_id = COALESCE(gb.location_id, b.location_id),
  location_type = COALESCE(NULLIF(gb.location_type, ''), b.location_type, 'at_salon'),
  updated_at = NOW()
FROM (
  SELECT DISTINCT ON (group_booking_id)
    group_booking_id,
    location_id,
    location_type::text AS location_type
  FROM public.bookings
  WHERE group_booking_id IS NOT NULL
  ORDER BY group_booking_id, created_at ASC
) b
WHERE b.group_booking_id = gb.id
  AND gb.location_id IS NULL;

-- Parent group should be pending when any child still awaits review.
UPDATE public.group_bookings gb
SET status = 'pending', updated_at = NOW()
WHERE gb.status IN ('confirmed', 'booked')
  AND EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.group_booking_id = gb.id
      AND b.status IN ('pending', 'pending_payment')
  );

CREATE INDEX IF NOT EXISTS idx_bookings_provider_group_status
  ON public.bookings (provider_id, group_booking_id, status)
  WHERE group_booking_id IS NOT NULL;

COMMENT ON INDEX public.idx_bookings_provider_group_status IS
  'Speeds pending-review scope queries and group status sync for provider dashboards.';
