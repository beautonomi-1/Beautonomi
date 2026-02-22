-- Beautonomi Database Migration
-- 093_paystack_subscriptions_and_features.sql
-- Paystack native subscriptions with feature gating

-- Add Paystack subscription fields to provider_subscriptions
ALTER TABLE provider_subscriptions
  ADD COLUMN IF NOT EXISTS paystack_subscription_code TEXT,
  ADD COLUMN IF NOT EXISTS paystack_authorization_code TEXT,
  ADD COLUMN IF NOT EXISTS paystack_customer_code TEXT,
  ADD COLUMN IF NOT EXISTS next_payment_date TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_payment_date TIMESTAMP WITH TIME ZONE;

-- Add feature gating to subscription_plans
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS is_free BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS max_bookings_per_month INTEGER,
  ADD COLUMN IF NOT EXISTS max_staff_members INTEGER,
  ADD COLUMN IF NOT EXISTS max_locations INTEGER DEFAULT 1;

-- Create index for Paystack subscription code lookups
CREATE INDEX IF NOT EXISTS idx_provider_subscriptions_paystack_code 
  ON provider_subscriptions(paystack_subscription_code) 
  WHERE paystack_subscription_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_provider_subscriptions_authorization_code 
  ON provider_subscriptions(paystack_authorization_code) 
  WHERE paystack_authorization_code IS NOT NULL;

-- Create index for free tier lookups
CREATE INDEX IF NOT EXISTS idx_subscription_plans_is_free 
  ON subscription_plans(is_free);

-- Subscription plan features table (for easier querying)
CREATE TABLE IF NOT EXISTS subscription_plan_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(plan_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_subscription_plan_features_plan 
  ON subscription_plan_features(plan_id);

CREATE INDEX IF NOT EXISTS idx_subscription_plan_features_key 
  ON subscription_plan_features(feature_key);

-- RLS for subscription_plan_features
ALTER TABLE subscription_plan_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage subscription plan features"
  ON subscription_plan_features FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'superadmin'
    )
  );

-- Function to check if provider has access to a feature
CREATE OR REPLACE FUNCTION provider_has_feature_access(
  provider_id_param UUID,
  feature_key_param TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  plan_features JSONB;
  is_free_plan BOOLEAN;
BEGIN
  -- Get subscription plan features
  SELECT 
    sp.features,
    COALESCE(sp.is_free, false)
  INTO plan_features, is_free_plan
  FROM provider_subscriptions ps
  JOIN subscription_plans sp ON sp.id = ps.plan_id
  WHERE ps.provider_id = provider_id_param
  AND ps.status = 'active'
  AND (ps.expires_at IS NULL OR ps.expires_at > NOW());

  -- If no active subscription, check if there's a free tier
  IF plan_features IS NULL THEN
    SELECT COALESCE(sp.is_free, false)
    INTO is_free_plan
    FROM subscription_plans sp
    WHERE sp.is_free = true
    AND sp.is_active = true
    ORDER BY sp.display_order
    LIMIT 1;

    -- Free tier has access to basic features only
    IF is_free_plan THEN
      RETURN feature_key_param IN (
        'booking_online',
        'reviews_ratings',
        'basic_analytics'
      );
    END IF;

    RETURN false;
  END IF;

  -- Check if feature is in plan's features array
  RETURN plan_features ? feature_key_param 
    OR (plan_features::text LIKE '%' || feature_key_param || '%');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get provider's subscription tier
CREATE OR REPLACE FUNCTION get_provider_subscription_tier(provider_id_param UUID)
RETURNS TABLE (
  plan_id UUID,
  plan_name TEXT,
  is_free BOOLEAN,
  features JSONB,
  max_bookings_per_month INTEGER,
  max_staff_members INTEGER,
  max_locations INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sp.id,
    sp.name,
    COALESCE(sp.is_free, false),
    COALESCE(sp.features, '[]'::jsonb),
    sp.max_bookings_per_month,
    sp.max_staff_members,
    sp.max_locations
  FROM provider_subscriptions ps
  JOIN subscription_plans sp ON sp.id = ps.plan_id
  WHERE ps.provider_id = provider_id_param
  AND ps.status = 'active'
  AND (ps.expires_at IS NULL OR ps.expires_at > NOW())
  LIMIT 1;

  -- If no active subscription, return free tier if available
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      sp.id,
      sp.name,
      COALESCE(sp.is_free, false),
      COALESCE(sp.features, '[]'::jsonb),
      sp.max_bookings_per_month,
      sp.max_staff_members,
      sp.max_locations
    FROM subscription_plans sp
    WHERE sp.is_free = true
    AND sp.is_active = true
    ORDER BY sp.display_order
    LIMIT 1;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update subscription_plans to ensure features column exists and is properly typed
DO $$
BEGIN
  -- Ensure features is an array
  UPDATE subscription_plans
  SET features = '[]'::jsonb
  WHERE features IS NULL;
END $$;

-- Add comment for documentation
COMMENT ON FUNCTION provider_has_feature_access IS 'Checks if a provider has access to a specific feature based on their subscription tier';
COMMENT ON FUNCTION get_provider_subscription_tier IS 'Returns the active subscription tier details for a provider, or free tier if no active subscription';
