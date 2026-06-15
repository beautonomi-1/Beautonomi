-- Enable Supabase Realtime on public.bookings and public.booking_services.
--
-- Provider mobile subscribes to postgres_changes on these tables for live
-- bookings list refresh, dashboard metrics, nav badges, and in-app alerts.
-- Without publication membership those subscriptions silently never fire
-- (same class of bug fixed for notifications in 647 and chat in 687).

ALTER TABLE public.bookings REPLICA IDENTITY FULL;
ALTER TABLE public.booking_services REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'bookings'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'booking_services'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_services;
    END IF;
  END IF;
END $$;
