-- Enable Supabase Realtime on public.product_orders for provider dashboard refresh.
--
-- The provider app subscribes to INSERT/UPDATE on product_orders scoped by provider_id.
-- Without publication membership, walk-in and online order updates do not push to clients;
-- pull-to-refresh and explicit refresh events still work.

ALTER TABLE public.product_orders REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'product_orders'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.product_orders;
    END IF;
  END IF;
END $$;
