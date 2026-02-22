-- Beautonomi Database Migration
-- 028_membership_orders.sql
-- Orders for purchasing customer memberships via Paystack

CREATE TABLE IF NOT EXISTS membership_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES membership_plans(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'ZAR',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
  paystack_reference TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER update_membership_orders_updated_at BEFORE UPDATE ON membership_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_membership_orders_user ON membership_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_membership_orders_provider ON membership_orders(provider_id);
CREATE INDEX IF NOT EXISTS idx_membership_orders_status ON membership_orders(status);

ALTER TABLE membership_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own membership orders"
  ON membership_orders FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Superadmins can manage membership orders"
  ON membership_orders FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
  );

