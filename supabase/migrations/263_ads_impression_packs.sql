-- Impression packs: providers buy fixed amounts (50, 100, 500, 1000) at set prices.

-- Packs defined by superadmin (price in ZAR, display_order for UI)
CREATE TABLE IF NOT EXISTS ads_impression_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  impressions INTEGER NOT NULL CHECK (impressions > 0),
  price_zar NUMERIC(10, 2) NOT NULL CHECK (price_zar > 0),
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ads_impression_packs_impressions ON ads_impression_packs(impressions);
CREATE INDEX IF NOT EXISTS idx_ads_impression_packs_active_order ON ads_impression_packs(is_active, display_order) WHERE is_active = true;

ALTER TABLE ads_impression_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view active ads_impression_packs"
  ON ads_impression_packs FOR SELECT USING (is_active = true);
CREATE POLICY "Superadmins can manage ads_impression_packs"
  ON ads_impression_packs FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin'));

CREATE TRIGGER update_ads_impression_packs_updated_at
  BEFORE UPDATE ON ads_impression_packs FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Campaign can be pack-based: fixed impressions at fixed cost per impression (budget / pack_impressions)
ALTER TABLE ads_campaigns
  ADD COLUMN IF NOT EXISTS pack_impressions INTEGER CHECK (pack_impressions IS NULL OR pack_impressions > 0);
COMMENT ON COLUMN ads_campaigns.pack_impressions IS 'If set, campaign was bought as a pack; cost per impression = budget/pack_impressions, delivery capped at this many impressions.';

-- Seed default packs (50, 100, 500, 1000); admin can edit in Control Plane
INSERT INTO ads_impression_packs (impressions, price_zar, display_order, is_active)
VALUES (50, 25.00, 1, true), (100, 45.00, 2, true), (500, 200.00, 3, true), (1000, 350.00, 4, true)
ON CONFLICT (impressions) DO NOTHING;

-- Trigger: for pack campaigns, cost = budget/pack_impressions and cap at pack_impressions; else use bid_cpc * ratio
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
  v_impression_count BIGINT;
  v_cost NUMERIC(12, 4);
BEGIN
  IF NEW.event_type != 'impression' OR NEW.campaign_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT pack_impressions, budget INTO v_pack_impressions, v_budget
  FROM ads_campaigns WHERE id = NEW.campaign_id;

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