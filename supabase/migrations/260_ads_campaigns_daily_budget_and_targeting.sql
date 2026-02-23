-- Ads: daily budget, bid_cpc, and provider read access to ads_events for performance dashboard

-- Add daily_budget (optional): cap spend per day. NULL = no daily cap (only total budget).
ALTER TABLE ads_campaigns
  ADD COLUMN IF NOT EXISTS daily_budget NUMERIC(12, 2) CHECK (daily_budget IS NULL OR daily_budget >= 0);

-- Explicit bid per click (ZAR). Stored in bid_settings as { "cpc": number } but column allows quick sorting.
ALTER TABLE ads_campaigns
  ADD COLUMN IF NOT EXISTS bid_cpc NUMERIC(8, 2) NOT NULL DEFAULT 0 CHECK (bid_cpc >= 0);

COMMENT ON COLUMN ads_campaigns.daily_budget IS 'Optional daily spend cap (ZAR). NULL = use only total budget.';
COMMENT ON COLUMN ads_campaigns.bid_cpc IS 'Max cost per click (ZAR) for auction. Placement also depends on quality and relevance.';

-- Targeting: use existing JSONB. Expected shape: { "global_category_ids": ["uuid", ...], "specialty_ids": [] }.
-- No schema change; document in app.

-- Allow providers to read their own ads_events for Ad Performance Dashboard
DROP POLICY IF EXISTS "Providers can view own ads_events" ON ads_events;
CREATE POLICY "Providers can view own ads_events"
  ON ads_events FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM providers WHERE providers.id = ads_events.provider_id AND providers.user_id = auth.uid())
  );

-- Service/anon need to insert ads_events from public search (backend uses service role)
-- No new policy needed; superadmin already has FOR ALL.

CREATE INDEX IF NOT EXISTS idx_ads_campaigns_active_bid ON ads_campaigns(status, bid_cpc DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_ads_events_provider_type_created ON ads_events(provider_id, event_type, created_at DESC);
