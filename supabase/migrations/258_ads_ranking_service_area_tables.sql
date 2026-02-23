-- Ads: campaigns and events (paid ads / boosted listings / sponsored slots)
CREATE TABLE IF NOT EXISTS ads_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'ended')),
  budget NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (budget >= 0),
  spent NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (spent >= 0),
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  targeting JSONB DEFAULT '{}'::jsonb,
  bid_settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ads_campaigns_provider ON ads_campaigns(provider_id);
CREATE INDEX IF NOT EXISTS idx_ads_campaigns_status ON ads_campaigns(status);

ALTER TABLE ads_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers can manage own ads_campaigns"
  ON ads_campaigns FOR ALL
  USING (
    EXISTS (SELECT 1 FROM providers WHERE providers.id = ads_campaigns.provider_id AND providers.user_id = auth.uid())
  );

CREATE POLICY "Superadmins can manage ads_campaigns"
  ON ads_campaigns FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

CREATE TRIGGER update_ads_campaigns_updated_at
  BEFORE UPDATE ON ads_campaigns FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS ads_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES ads_campaigns(id) ON DELETE SET NULL,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'click', 'book')),
  idempotency_key TEXT,
  attribution JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ads_events_idempotency ON ads_events(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ads_events_campaign ON ads_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ads_events_provider_created ON ads_events(provider_id, created_at DESC);

ALTER TABLE ads_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage ads_events"
  ON ads_events FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

-- Ranking: quality score and events (SEO-like discoverability)
CREATE TABLE IF NOT EXISTS provider_quality_score (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  computed_score NUMERIC(6, 4) NOT NULL DEFAULT 0 CHECK (computed_score >= 0 AND computed_score <= 1),
  components JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_quality_score_score ON provider_quality_score(computed_score DESC);

ALTER TABLE provider_quality_score ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage provider_quality_score"
  ON provider_quality_score FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

CREATE TRIGGER update_provider_quality_score_updated_at
  BEFORE UPDATE ON provider_quality_score FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS ranking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL,
  value NUMERIC(12, 4),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ranking_events_provider_created ON ranking_events(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ranking_events_signal ON ranking_events(signal_type);

ALTER TABLE ranking_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage ranking_events"
  ON ranking_events FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

-- Distance: provider service area (radius or zones; Tinder-style)
CREATE TABLE IF NOT EXISTS provider_service_area (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'radius' CHECK (mode IN ('radius', 'zones')),
  radius_km NUMERIC(6, 2) CHECK (radius_km IS NULL OR radius_km > 0),
  home_latitude NUMERIC(10, 7),
  home_longitude NUMERIC(10, 7),
  zones JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_service_area_provider ON provider_service_area(provider_id);

ALTER TABLE provider_service_area ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers can manage own provider_service_area"
  ON provider_service_area FOR ALL
  USING (
    EXISTS (SELECT 1 FROM providers WHERE providers.id = provider_service_area.provider_id AND providers.user_id = auth.uid())
  );

CREATE POLICY "Superadmins can manage provider_service_area"
  ON provider_service_area FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

CREATE TRIGGER update_provider_service_area_updated_at
  BEFORE UPDATE ON provider_service_area FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE ads_campaigns IS 'Paid ads campaigns: budget, targeting, bid settings';
COMMENT ON TABLE ads_events IS 'Ads events: impression, click, book with idempotency and attribution';
COMMENT ON TABLE provider_quality_score IS 'Computed SEO-like quality score per provider';
COMMENT ON TABLE ranking_events IS 'Signals for ranking: response time, completion rate, reviews, cancellations';
COMMENT ON TABLE provider_service_area IS 'Provider service area: radius or zones for house calls';
