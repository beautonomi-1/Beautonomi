-- Beautonomi Database Migration
-- 026_memberships_and_giftcard_orders.sql
-- Customer memberships + gift card purchase orders

-- Provider membership plans (for customers)
CREATE TABLE IF NOT EXISTS membership_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price_monthly NUMERIC(10, 2) NOT NULL CHECK (price_monthly >= 0),
  currency TEXT NOT NULL DEFAULT 'ZAR',
  discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membership_plans_provider ON membership_plans(provider_id);
CREATE INDEX IF NOT EXISTS idx_membership_plans_active ON membership_plans(provider_id, is_active) WHERE is_active = true;

CREATE TRIGGER update_membership_plans_updated_at BEFORE UPDATE ON membership_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Customer memberships
CREATE TABLE IF NOT EXISTS user_memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES membership_plans(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, provider_id)
);

CREATE TRIGGER update_user_memberships_updated_at BEFORE UPDATE ON user_memberships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_user_memberships_user ON user_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_user_memberships_provider ON user_memberships(provider_id);

-- Gift card purchase orders (so we can sell/issue gift cards)
CREATE TABLE IF NOT EXISTS gift_card_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchaser_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recipient_email TEXT,
  provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'ZAR',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
  paystack_reference TEXT,
  gift_card_id UUID REFERENCES gift_cards(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER update_gift_card_orders_updated_at BEFORE UPDATE ON gift_card_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_gift_card_orders_status ON gift_card_orders(status);
CREATE INDEX IF NOT EXISTS idx_gift_card_orders_user ON gift_card_orders(purchaser_user_id) WHERE purchaser_user_id IS NOT NULL;

-- Bookings: membership linkage
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS membership_plan_id UUID REFERENCES membership_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS membership_discount_amount NUMERIC(10, 2) DEFAULT 0 CHECK (membership_discount_amount >= 0);

-- RLS
ALTER TABLE membership_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_card_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active membership plans"
  ON membership_plans FOR SELECT
  USING (
    is_active = true AND
    EXISTS (SELECT 1 FROM providers p WHERE p.id = membership_plans.provider_id AND p.status = 'active')
  );

CREATE POLICY "Providers can manage own membership plans"
  ON membership_plans FOR ALL
  USING (
    EXISTS (SELECT 1 FROM providers p WHERE p.id = membership_plans.provider_id AND p.user_id = auth.uid())
  );

CREATE POLICY "Users can view own memberships"
  ON user_memberships FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage own memberships"
  ON user_memberships FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Users can view own gift card orders"
  ON gift_card_orders FOR SELECT
  USING (purchaser_user_id = auth.uid());

CREATE POLICY "Superadmins can manage gift card orders"
  ON gift_card_orders FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
  );

