-- Part B: journey ETA columns, additional-charge paid notification gate, finance_transactions realtime.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS provider_eta_minutes integer,
  ADD COLUMN IF NOT EXISTS eta_source text;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_eta_source_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_eta_source_check
  CHECK (eta_source IS NULL OR eta_source IN ('manual', 'gps'));

ALTER TABLE public.additional_charges
  ADD COLUMN IF NOT EXISTS paid_notified_at timestamptz;

COMMENT ON COLUMN public.bookings.provider_eta_minutes IS 'Provider-entered or GPS-derived ETA in minutes from start-journey or location updates.';
COMMENT ON COLUMN public.bookings.eta_source IS 'manual = provider picked ETA; gps = computed from live location.';
COMMENT ON COLUMN public.additional_charges.paid_notified_at IS 'Set when customer+provider paid notifications were sent; idempotency gate.';

ALTER TABLE public.finance_transactions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'finance_transactions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.finance_transactions;
    END IF;

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
