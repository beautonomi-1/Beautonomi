-- Beautonomi Database Migration
-- 032_fix_payout_status_and_actor.sql
-- Align payout status usage with enum and add processed_by for auditability.

ALTER TABLE payouts
  ADD COLUMN IF NOT EXISTS processed_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Fix payout earnings trigger to use the correct enum value: 'completed'
CREATE OR REPLACE FUNCTION update_provider_earnings()
RETURNS TRIGGER AS $$
DECLARE
    v_earnings NUMERIC(10, 2);
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'completed' THEN
        SELECT COALESCE(SUM(net_amount), 0)
        INTO v_earnings
        FROM payouts
        WHERE provider_id = NEW.provider_id
        AND status = 'completed';

        UPDATE providers
        SET total_earnings = v_earnings
        WHERE id = NEW.provider_id;
    ELSIF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status != 'completed' THEN
        SELECT COALESCE(SUM(net_amount), 0)
        INTO v_earnings
        FROM payouts
        WHERE provider_id = NEW.provider_id
        AND status = 'completed';

        UPDATE providers
        SET total_earnings = v_earnings
        WHERE id = NEW.provider_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

