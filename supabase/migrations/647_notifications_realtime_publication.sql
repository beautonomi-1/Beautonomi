-- Enable Supabase Realtime on public.notifications.
--
-- The provider web "payment received" popup (TerminalPaymentAlertListener) subscribes to
-- INSERTs on public.notifications filtered by the current user_id and opens an instant alert
-- for Paystack Virtual Terminal payments. That subscription only delivers events when the
-- table is part of the supabase_realtime publication; without it, the durable in-app
-- notification is written but the popup never fires, so providers appear to get "no
-- notification" when a terminal payment arrives.
--
-- REPLICA IDENTITY FULL keeps UPDATE payloads complete (e.g. read_at changes) for any other
-- realtime consumers. RLS on notifications already restricts rows to the owning user, so this
-- does not widen data exposure.

ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
  END IF;
END $$;
