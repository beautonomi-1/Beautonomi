-- Beautonomi Database Migration
-- 039_loyalty_milestones.sql
-- Adds loyalty point milestones that award rewards (initially wallet credit) when a user reaches thresholds.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'loyalty_reward_type') THEN
    CREATE TYPE loyalty_reward_type AS ENUM ('wallet_credit');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS loyalty_milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  points_threshold INTEGER NOT NULL CHECK (points_threshold > 0),
  reward_type loyalty_reward_type NOT NULL DEFAULT 'wallet_credit',
  reward_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (reward_amount >= 0),
  reward_currency TEXT NOT NULL DEFAULT 'ZAR',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(points_threshold)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_milestones_active ON loyalty_milestones(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_loyalty_milestones_threshold ON loyalty_milestones(points_threshold);

CREATE TRIGGER update_loyalty_milestones_updated_at
BEFORE UPDATE ON loyalty_milestones
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Track which milestone rewards were awarded to which user (idempotency)
CREATE TABLE IF NOT EXISTS loyalty_milestone_awards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone_id UUID NOT NULL REFERENCES loyalty_milestones(id) ON DELETE CASCADE,
  awarded_points_balance INTEGER NOT NULL DEFAULT 0,
  reward_type loyalty_reward_type NOT NULL,
  reward_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  reward_currency TEXT NOT NULL DEFAULT 'ZAR',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, milestone_id)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_milestone_awards_user ON loyalty_milestone_awards(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_milestone_awards_milestone ON loyalty_milestone_awards(milestone_id);

-- RLS
ALTER TABLE loyalty_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_milestone_awards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active loyalty milestones"
  ON loyalty_milestones FOR SELECT
  USING (is_active = true);

CREATE POLICY "Superadmins can manage loyalty milestones"
  ON loyalty_milestones FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

CREATE POLICY "Users can view own loyalty milestone awards"
  ON loyalty_milestone_awards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Superadmins can view all loyalty milestone awards"
  ON loyalty_milestone_awards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

-- Award function: on earning/adjusting points, award any newly-reached milestones (wallet credit)
CREATE OR REPLACE FUNCTION award_loyalty_milestones()
RETURNS TRIGGER AS $$
DECLARE
  v_balance INTEGER;
  v_wallet_id UUID;
  v_wallet_currency TEXT;
  m RECORD;
BEGIN
  IF NEW.transaction_type NOT IN ('earned', 'adjusted') THEN
    RETURN NEW;
  END IF;

  v_balance := get_user_loyalty_balance(NEW.user_id);

  -- Ensure wallet exists
  SELECT id, currency INTO v_wallet_id, v_wallet_currency
  FROM user_wallets
  WHERE user_id = NEW.user_id
  LIMIT 1
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO user_wallets (user_id, currency) VALUES (NEW.user_id, 'ZAR')
    RETURNING id, currency INTO v_wallet_id, v_wallet_currency;
  END IF;

  FOR m IN
    SELECT *
    FROM loyalty_milestones
    WHERE is_active = true
      AND points_threshold <= v_balance
    ORDER BY points_threshold ASC
  LOOP
    -- Award once per user per milestone
    IF NOT EXISTS (
      SELECT 1 FROM loyalty_milestone_awards
      WHERE user_id = NEW.user_id AND milestone_id = m.id
    ) THEN
      -- Create award record
      INSERT INTO loyalty_milestone_awards (
        user_id,
        milestone_id,
        awarded_points_balance,
        reward_type,
        reward_amount,
        reward_currency,
        metadata
      )
      VALUES (
        NEW.user_id,
        m.id,
        v_balance,
        m.reward_type,
        m.reward_amount,
        m.reward_currency,
        jsonb_build_object('source_tx_id', NEW.id, 'source_reference_type', NEW.reference_type, 'source_reference_id', NEW.reference_id)
      );

      -- Reward: wallet credit
      IF m.reward_type = 'wallet_credit' AND m.reward_amount > 0 THEN
        -- Single-currency assumption: credit in wallet currency if mismatch
        UPDATE user_wallets SET balance = balance + m.reward_amount WHERE id = v_wallet_id;
        INSERT INTO wallet_transactions (wallet_id, type, amount, description, reference_id, reference_type)
        VALUES (v_wallet_id, 'credit', m.reward_amount, CONCAT('Loyalty milestone reward: ', m.name), m.id, 'loyalty_milestone');
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION award_loyalty_milestones() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_loyalty_points_award_milestones ON loyalty_point_transactions;
CREATE TRIGGER on_loyalty_points_award_milestones
AFTER INSERT ON loyalty_point_transactions
FOR EACH ROW EXECUTE FUNCTION award_loyalty_milestones();

