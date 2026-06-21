-- ---------------------------------------------------------------------------
-- 705. Per-recipient marketing campaign send log
--
-- Records exactly which (campaign, customer) pairs have been delivered so a
-- campaign that gets stuck in "sending" (process crash / timeout mid-send) can
-- be safely requeued by the cron without re-messaging recipients who already
-- received it. Provides exactly-once delivery semantics across both the
-- platform-credentials path and the provider-own-credentials path.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.marketing_campaign_sends (
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  message_id text,
  error text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, customer_id)
);

CREATE INDEX IF NOT EXISTS ix_marketing_campaign_sends_campaign
  ON public.marketing_campaign_sends (campaign_id, status);

ALTER TABLE public.marketing_campaign_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_campaign_sends_service ON public.marketing_campaign_sends;
CREATE POLICY marketing_campaign_sends_service ON public.marketing_campaign_sends
  FOR ALL USING (auth.role() = 'service_role');
