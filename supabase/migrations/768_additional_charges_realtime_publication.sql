-- Enable Supabase Realtime on public.additional_charges.
--
-- Customer mobile/web subscribes to postgres_changes on this table so
-- newly-sent additional charges appear live without polling. Without
-- publication membership those subscriptions silently never fire
-- (same class of bug fixed for bookings in 690).

ALTER TABLE public.additional_charges REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'additional_charges'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.additional_charges;
    END IF;
  END IF;
END $$;
