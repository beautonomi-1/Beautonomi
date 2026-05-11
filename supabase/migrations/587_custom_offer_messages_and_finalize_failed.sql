-- Custom offers: faster message lookup for attachment patches; finalize_failed when booking insert fails after payment.

-- 1) Extend custom_offers.status for post-payment booking insert failures (customer paid; needs support/retry).
ALTER TABLE custom_offers
  DROP CONSTRAINT IF EXISTS custom_offers_status_check;

ALTER TABLE custom_offers
  ADD CONSTRAINT custom_offers_status_check
  CHECK (status IN (
    'pending',
    'accepted',
    'declined',
    'expired',
    'payment_pending',
    'paid',
    'withdrawn',
    'finalize_failed'
  ));

COMMENT ON COLUMN custom_offers.status IS
  'pending, accepted, declined, expired, payment_pending, paid, withdrawn, finalize_failed (paid but booking could not be finalized — reconcile manually)';

-- 2) GIN index on attachments for jsonb @> containment queries (patch helper).
CREATE INDEX IF NOT EXISTS idx_messages_attachments_gin
  ON messages USING gin ((attachments::jsonb))
  WHERE attachments IS NOT NULL;

-- 3) Realtime: customers + providers subscribe to `custom_offers` rows they can already see via RLS.
--    Required so the customer checkout success page and chat bubbles update instantly when the webhook
--    finalizes payment instead of waiting on polling fallback.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.custom_offers;
    EXCEPTION WHEN duplicate_object THEN
      -- already in publication; safe to ignore
      NULL;
    END;
  END IF;
END $$;

-- REPLICA IDENTITY FULL so realtime UPDATE payloads include all columns (booking_id, status), not just PK.
ALTER TABLE public.custom_offers REPLICA IDENTITY FULL;
