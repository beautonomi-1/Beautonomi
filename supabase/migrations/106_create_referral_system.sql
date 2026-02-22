-- Create referral_settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS referral_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_amount DECIMAL(10, 2) NOT NULL DEFAULT 50.00,
  referral_message TEXT NOT NULL DEFAULT 'Join Beautonomi and get rewarded! Use my referral link to get started.',
  referral_currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referral_settings_single_row CHECK (id = '00000000-0000-0000-0000-000000000001'::uuid)
);

-- Insert default settings if not exists
INSERT INTO referral_settings (id, referral_amount, referral_message, referral_currency, is_enabled)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 50.00, 'Join Beautonomi and get rewarded! Use my referral link to get started.', 'ZAR', true)
ON CONFLICT (id) DO NOTHING;

-- Create user_referrals table to track referrals
CREATE TABLE IF NOT EXISTS user_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  referral_code VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, completed, cancelled
  reward_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  reward_currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_referrals_status_check CHECK (status IN ('pending', 'completed', 'cancelled'))
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_referrals_referrer_id ON user_referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_user_referrals_referred_user_id ON user_referrals(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_user_referrals_referral_code ON user_referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_user_referrals_status ON user_referrals(status);

-- Add referral_code column to users table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'referral_code'
  ) THEN
    ALTER TABLE users ADD COLUMN referral_code VARCHAR(50);
    CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
  END IF;
END $$;

-- Add referred_by column to users table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'referred_by'
  ) THEN
    ALTER TABLE users ADD COLUMN referred_by UUID REFERENCES users(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);
  END IF;
END $$;

-- Enable RLS
ALTER TABLE referral_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_referrals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for referral_settings (public read, superadmin write)
DROP POLICY IF EXISTS "referral_settings_select" ON referral_settings;
CREATE POLICY "referral_settings_select" ON referral_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "referral_settings_insert" ON referral_settings;
CREATE POLICY "referral_settings_insert" ON referral_settings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'superadmin'
    )
  );

DROP POLICY IF EXISTS "referral_settings_update" ON referral_settings;
CREATE POLICY "referral_settings_update" ON referral_settings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'superadmin'
    )
  );

-- RLS Policies for user_referrals (users can see their own referrals)
DROP POLICY IF EXISTS "user_referrals_select" ON user_referrals;
CREATE POLICY "user_referrals_select" ON user_referrals
  FOR SELECT USING (
    referrer_id = auth.uid() OR
    referred_user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'superadmin'
    )
  );

DROP POLICY IF EXISTS "user_referrals_insert" ON user_referrals;
CREATE POLICY "user_referrals_insert" ON user_referrals
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "user_referrals_update" ON user_referrals;
CREATE POLICY "user_referrals_update" ON user_referrals
  FOR UPDATE USING (
    referrer_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'superadmin'
    )
  );
