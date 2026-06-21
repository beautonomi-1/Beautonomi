-- ---------------------------------------------------------------------------
-- 706. Persist failed-delivery count on marketing campaigns
--
-- dispatchCampaign already computes a per-run failure count but had nowhere to
-- store it, so the provider campaigns table could only show "sent / intended"
-- and silently hid send failures. Adding failed_count lets the provider UI show
-- a factual delivery breakdown (delivered vs failed) aligned with the
-- per-recipient marketing_campaign_sends log.
-- ---------------------------------------------------------------------------

ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS failed_count integer NOT NULL DEFAULT 0;
