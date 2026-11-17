-- Live availability listens to booking_services with the visitor's own session.
-- REPLICA IDENTITY FULL published every column, including guest_email and
-- guest_phone, on that websocket frame. The listener only refetches
-- availability. It does not read the guest address.
--
-- Replica identity returns to the primary key, so an update still identifies
-- the row. The publication then lists every other column and omits
-- guest_email and guest_phone. A later column added to booking_services is
-- not published until this list is extended.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'booking_services'
    ) THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.booking_services;
    END IF;

    ALTER TABLE public.booking_services REPLICA IDENTITY DEFAULT;

    ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_services (
      id,
      booking_id,
      offering_id,
      staff_id,
      guest_name,
      duration_minutes,
      price,
      currency,
      scheduled_start_at,
      scheduled_end_at,
      actual_start_at,
      actual_end_at,
      created_at,
      updated_at,
      customization,
      tax_snapshot,
      group_participant_id
    );
  END IF;
END $$;
