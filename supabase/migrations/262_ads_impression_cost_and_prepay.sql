-- Superadmin-controlled cost per impression + pre-pay budget (ads_budget_orders)

-- 1) Cost per impression: ratio of bid_cpc (e.g. 0.05 = 5%). Superadmin sets in Control Plane.
ALTER TABLE ads_module_config
  ADD COLUMN IF NOT EXISTS cost_per_impression_ratio NUMERIC(6, 4) CHECK (
    cost_per_impression_ratio IS NULL OR (cost_per_impression_ratio >= 0 AND cost_per_impression_ratio <= 1)
  );
COMMENT ON COLUMN ads_module_config.cost_per_impression_ratio IS 'Cost per impression = bid_cpc * this ratio (e.g. 0.05 = 5%). NULL = use 0.05.';

-- 2) Ads budget orders: provider pre-pays campaign budget; platform gets money before campaign runs.
CREATE TABLE IF NOT EXISTS ads_budget_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES ads_campaigns(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'ZAR',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  paystack_reference TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ads_budget_orders_provider ON ads_budget_orders(provider_id);
CREATE INDEX IF NOT EXISTS idx_ads_budget_orders_campaign ON ads_budget_orders(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ads_budget_orders_status ON ads_budget_orders(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ads_budget_orders_paystack_ref ON ads_budget_orders(paystack_reference) WHERE paystack_reference IS NOT NULL;

ALTER TABLE ads_budget_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Providers can view own ads_budget_orders"
  ON ads_budget_orders FOR SELECT
  USING (EXISTS (SELECT 1 FROM providers WHERE providers.id = ads_budget_orders.provider_id AND providers.user_id = auth.uid()));
CREATE POLICY "Superadmins can manage ads_budget_orders"
  ON ads_budget_orders FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'superadmin'));

CREATE TRIGGER update_ads_budget_orders_updated_at
  BEFORE UPDATE ON ads_budget_orders FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE ads_budget_orders IS 'Pre-pay for ad campaign budget; platform receives payment before campaign gets budget.';

-- 3) Trigger: use cost_per_impression_ratio from ads_module_config (production); fallback 0.05
CREATE OR REPLACE FUNCTION ads_charge_on_impression()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ratio NUMERIC(6, 4);
BEGIN
  IF NEW.event_type != 'impression' OR NEW.campaign_id IS NULL THEN
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
