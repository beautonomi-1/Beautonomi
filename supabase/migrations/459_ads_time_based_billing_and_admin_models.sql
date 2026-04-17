-- Time-based ad billing model: providers pay fixed daily rate for N days
-- Also: admin control over which billing models are available

-- 1) Campaign billing model + time-based fields
ALTER TABLE ads_campaigns
  ADD COLUMN IF NOT EXISTS billing_model TEXT NOT NULL DEFAULT 'cpc_budget'
    CHECK (billing_model IN ('cpc_budget', 'impression_pack', 'time_based'));

ALTER TABLE ads_campaigns
  ADD COLUMN IF NOT EXISTS duration_days INTEGER CHECK (duration_days IS NULL OR duration_days > 0);

ALTER TABLE ads_campaigns
  ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ;

ALTER TABLE ads_campaigns
  ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ;

COMMENT ON COLUMN ads_campaigns.billing_model IS 'cpc_budget = pay per impression (bid*ratio); impression_pack = fixed impressions; time_based = fixed daily rate for N days';
COMMENT ON COLUMN ads_campaigns.duration_days IS 'For time_based: how many days the campaign runs';
COMMENT ON COLUMN ads_campaigns.start_at IS 'Campaign start date (required for time_based, optional for others)';
COMMENT ON COLUMN ads_campaigns.end_at IS 'Campaign end date (auto-computed for time_based as start_at + duration_days)';

-- 2) Time-based pricing tiers (superadmin-defined)
CREATE TABLE IF NOT EXISTS ads_time_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  duration_days INTEGER NOT NULL CHECK (duration_days > 0),
  label TEXT NOT NULL,
  price_zar NUMERIC(10, 2) NOT NULL CHECK (price_zar > 0),
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ads_time_packs_duration ON ads_time_packs(duration_days);
CREATE INDEX IF NOT EXISTS idx_ads_time_packs_active_order ON ads_time_packs(is_active, display_order) WHERE is_active = true;

ALTER TABLE ads_time_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active ads_time_packs"
  ON ads_time_packs FOR SELECT USING (is_active = true);

CREATE POLICY "Superadmins can manage ads_time_packs"
  ON ads_time_packs FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin'));

CREATE TRIGGER update_ads_time_packs_updated_at
  BEFORE UPDATE ON ads_time_packs FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Seed default time packs
INSERT INTO ads_time_packs (duration_days, label, price_zar, display_order, is_active)
VALUES
  (1, '1 Day Boost', 29.00, 1, true),
  (3, '3 Day Boost', 69.00, 2, true),
  (7, '7 Day Boost', 149.00, 3, true),
  (14, '14 Day Boost', 249.00, 4, true),
  (30, '30 Day Boost', 399.00, 5, true)
ON CONFLICT (duration_days) DO NOTHING;

-- 3) Admin model control: which billing models are available for providers
ALTER TABLE ads_module_config
  ADD COLUMN IF NOT EXISTS available_models TEXT[] NOT NULL DEFAULT '{cpc_budget,impression_pack,time_based}';

ALTER TABLE ads_module_config
  ADD COLUMN IF NOT EXISTS default_model TEXT NOT NULL DEFAULT 'time_based';

COMMENT ON COLUMN ads_module_config.available_models IS 'Which billing models providers can choose: cpc_budget, impression_pack, time_based';
COMMENT ON COLUMN ads_module_config.default_model IS 'Default billing model shown to providers';

-- 4) Update the charge trigger to handle time-based campaigns (no per-impression charge)
CREATE OR REPLACE FUNCTION ads_charge_on_impression()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ratio NUMERIC(6, 4);
  v_pack_impressions INTEGER;
  v_budget NUMERIC(12, 2);
  v_billing_model TEXT;
  v_impression_count BIGINT;
  v_cost NUMERIC(12, 4);
BEGIN
  IF NEW.event_type != 'impression' OR NEW.campaign_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT billing_model, pack_impressions, budget
  INTO v_billing_model, v_pack_impressions, v_budget
  FROM ads_campaigns WHERE id = NEW.campaign_id;

  -- Time-based campaigns: no per-impression charge (prepaid flat rate)
  IF v_billing_model = 'time_based' THEN
    RETURN NEW;
  END IF;

  -- Pack campaigns: fixed cost per impression = budget / pack_impressions
  IF v_pack_impressions IS NOT NULL AND v_pack_impressions > 0 AND v_budget > 0 THEN
    SELECT COUNT(*) INTO v_impression_count
    FROM ads_events
    WHERE campaign_id = NEW.campaign_id AND event_type = 'impression';
    IF v_impression_count > v_pack_impressions THEN
      RETURN NEW;
    END IF;
    v_cost := v_budget / v_pack_impressions;
    UPDATE ads_campaigns
    SET spent = COALESCE(spent, 0) + v_cost,
        updated_at = NOW()
    WHERE id = NEW.campaign_id;
    RETURN NEW;
  END IF;

  -- CPC budget: bid_cpc * ratio
  SELECT COALESCE(cost_per_impression_ratio, 0.05)
  INTO v_ratio
  FROM ads_module_config
  WHERE environment = 'production'
  LIMIT 1;
  IF v_ratio IS NULL THEN
    v_ratio := 0.05;
  END IF;

  UPDATE ads_campaigns
  SET spent = LEAST(COALESCE(spent, 0) + (COALESCE(bid_cpc, 0) * v_ratio), budget),
      updated_at = NOW()
  WHERE id = NEW.campaign_id;

  RETURN NEW;
END;
$$;

COMMENT ON TABLE ads_time_packs IS 'Time-based ad pricing tiers: providers pay flat rate for N days of sponsored placement';
