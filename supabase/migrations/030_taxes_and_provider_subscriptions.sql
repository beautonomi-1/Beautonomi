-- Beautonomi Database Migration
-- 030_taxes_and_provider_subscriptions.sql
-- Adds tax configuration + provider subscription billing (orders) and Paystack plan codes

-- Provider tax configuration (optional)
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS tax_rate_percent NUMERIC(5, 2) DEFAULT 0
    CHECK (tax_rate_percent >= 0 AND tax_rate_percent <= 100);

-- Booking tax amount (pass-through, excluded from platform commission)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(10, 2) DEFAULT 0
    CHECK (tax_amount >= 0);

-- Paystack plan codes for provider subscription plans (optional)
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS paystack_plan_code_monthly TEXT,
  ADD COLUMN IF NOT EXISTS paystack_plan_code_yearly TEXT;

-- Provider subscription billing period (needed to compute expiry cleanly)
ALTER TABLE provider_subscriptions
  ADD COLUMN IF NOT EXISTS billing_period TEXT CHECK (billing_period IN ('monthly', 'yearly')),
  ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT false;

-- Provider subscription orders (one-off billing with Paystack initialize + webhook)
CREATE TABLE IF NOT EXISTS provider_subscription_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  billing_period TEXT NOT NULL CHECK (billing_period IN ('monthly', 'yearly')),
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'ZAR',
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed')) DEFAULT 'pending',
  paystack_reference TEXT,
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER update_provider_subscription_orders_updated_at BEFORE UPDATE ON provider_subscription_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_provider_subscription_orders_provider ON provider_subscription_orders(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_subscription_orders_status ON provider_subscription_orders(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_subscription_orders_reference_unique
  ON provider_subscription_orders(paystack_reference) WHERE paystack_reference IS NOT NULL;

ALTER TABLE provider_subscription_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers can view own subscription orders"
  ON provider_subscription_orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM providers p
      WHERE p.id = provider_subscription_orders.provider_id
      AND (
        p.user_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM provider_staff ps
          WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Providers can create own subscription orders"
  ON provider_subscription_orders FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM providers p
      WHERE p.id = provider_subscription_orders.provider_id
      AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Superadmins can manage all subscription orders"
  ON provider_subscription_orders FOR ALL
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'superadmin'));

