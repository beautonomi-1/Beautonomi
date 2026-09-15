-- Migration 913: user_blocks realtime for admin shell badge refresh

ALTER TABLE public.user_blocks REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'user_blocks'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.user_blocks;
    END IF;
  END IF;
END $$;
