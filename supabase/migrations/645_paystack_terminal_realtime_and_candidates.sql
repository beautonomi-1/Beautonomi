-- Paystack Virtual Terminal payments: realtime delivery + ranked match candidates.
--
-- 1) Enable Supabase Realtime on provider_paystack_terminal_payments so the provider
--    apps (mobile + web) can open an instant "payment received" popup via postgres_changes
--    instead of 15s polling. REPLICA IDENTITY FULL ensures UPDATE payloads carry the full
--    row (allocation_status, suggested_entity_*, etc.), not just the primary key.
-- 2) Add match_candidates JSONB to store the ranked allocation suggestions (amount + timing)
--    that power the one-tap "assign" picker in the popup and the admin SPA. The top candidate
--    continues to be mirrored into suggested_entity_type/id, suggestion_confidence, and
--    candidate_match_reasons for backwards compatibility.

ALTER TABLE public.provider_paystack_terminal_payments
    ADD COLUMN IF NOT EXISTS match_candidates JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.provider_paystack_terminal_payments REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'provider_paystack_terminal_payments'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.provider_paystack_terminal_payments;
    END IF;
  END IF;
END $$;
