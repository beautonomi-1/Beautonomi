-- Audit + remove duplicate guest_name booking_services from online group checkout (see scripts/prod/booking-flows-baseline-reports.sql).

CREATE TABLE IF NOT EXISTS public.audit_deleted_booking_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_service_id UUID NOT NULL,
  booking_id UUID NOT NULL,
  offering_id UUID,
  guest_name TEXT,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT NOT NULL DEFAULT 'duplicate_group_guest_line'
);

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    WITH online_group AS (
      SELECT b.id AS booking_id
      FROM public.bookings b
      WHERE b.booking_source = 'online'
        AND b.group_booking_id IS NOT NULL
    ),
    dup_candidates AS (
      SELECT bs.id, bs.booking_id, bs.offering_id, bs.guest_name
      FROM public.booking_services bs
      INNER JOIN online_group og ON og.booking_id = bs.booking_id
      WHERE bs.guest_name IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.booking_services twin
          WHERE twin.booking_id = bs.booking_id
            AND twin.offering_id = bs.offering_id
            AND twin.guest_name IS NULL
            AND twin.id <> bs.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.staff_earnings_lines sel
          WHERE sel.booking_service_id = bs.id
        )
    )
    SELECT * FROM dup_candidates
  LOOP
    INSERT INTO public.audit_deleted_booking_services (booking_service_id, booking_id, offering_id, guest_name)
    VALUES (r.id, r.booking_id, r.offering_id, r.guest_name);
    DELETE FROM public.booking_services WHERE id = r.id;
  END LOOP;
END $$;
