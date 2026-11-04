-- Providers who already created staff group bookings keep access after gating is enforced.
UPDATE public.providers p
SET group_booking_enabled = true
WHERE p.group_booking_enabled = false
  AND (
    EXISTS (
      SELECT 1 FROM public.group_bookings gb
      WHERE gb.provider_id = p.id AND gb.created_by IS NOT NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.group_bookings gb
      JOIN public.bookings b ON b.id = gb.primary_contact_booking_id
      WHERE gb.provider_id = p.id
        AND COALESCE(b.booking_source, '') <> 'online'
    )
  );
