-- Charge per impression: when an impression event is inserted, add cost to campaign spent.
-- Cost per impression = bid_cpc * 0.05 (5% of bid). Spent is capped at budget atomically.

CREATE OR REPLACE FUNCTION ads_charge_on_impression()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ratio NUMERIC(4, 4) := 0.05;
BEGIN
  IF NEW.event_type != 'impression' OR NEW.campaign_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE ads_campaigns
  SET spent = LEAST(COALESCE(spent, 0) + (COALESCE(bid_cpc, 0) * v_ratio), budget),
      updated_at = NOW()
  WHERE id = NEW.campaign_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS charge_on_impression ON ads_events;
CREATE TRIGGER charge_on_impression
  AFTER INSERT ON ads_events
  FOR EACH ROW
  WHEN (NEW.event_type = 'impression' AND NEW.campaign_id IS NOT NULL)
  EXECUTE FUNCTION ads_charge_on_impression();

COMMENT ON FUNCTION ads_charge_on_impression() IS 'Adds per-impression cost (5% of bid_cpc) to ads_campaigns.spent when an impression is inserted; caps at budget.';
