-- Beautonomi Database Migration
-- 188_create_provider_gamification.sql
-- Creates provider gamification system with badges, points, and milestones

-- Provider badges table
CREATE TABLE IF NOT EXISTS provider_badges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon_url TEXT, -- Optional badge icon
  tier INTEGER NOT NULL CHECK (tier >= 1), -- 1=Bronze, 2=Silver, 3=Gold, 4=Platinum, 5=Diamond
  color TEXT, -- Hex color for badge display
  requirements JSONB NOT NULL DEFAULT '{}', -- {points: 1000, min_rating: 4.5, min_reviews: 50, ...}
  benefits JSONB NOT NULL DEFAULT '{}', -- {free_subscription: true, featured: true, ...}
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Provider points and achievements
CREATE TABLE IF NOT EXISTS provider_points (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL UNIQUE REFERENCES providers(id) ON DELETE CASCADE,
  total_points INTEGER DEFAULT 0 CHECK (total_points >= 0),
  current_tier_points INTEGER DEFAULT 0, -- Points in current tier
  lifetime_points INTEGER DEFAULT 0, -- Never decreases
  current_badge_id UUID REFERENCES provider_badges(id),
  badge_earned_at TIMESTAMP WITH TIME ZONE,
  badge_expires_at TIMESTAMP WITH TIME ZONE, -- If badge requires maintenance
  last_calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Provider point history (for transparency and debugging)
CREATE TABLE IF NOT EXISTS provider_point_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  points INTEGER NOT NULL, -- Can be negative for deductions
  source TEXT NOT NULL, -- 'booking_completed', 'review_received', 'milestone', 'admin_adjustment', etc.
  source_id UUID, -- Reference to booking, review, etc.
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Provider milestones (achievements unlocked)
CREATE TABLE IF NOT EXISTS provider_milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  milestone_type TEXT NOT NULL, -- 'first_booking', '100_reviews', 'perfect_rating_month', etc.
  achieved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  UNIQUE(provider_id, milestone_type)
);

-- Add badge_id to providers for quick lookup
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS current_badge_id UUID REFERENCES provider_badges(id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_provider_points_provider ON provider_points(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_points_badge ON provider_points(current_badge_id) WHERE current_badge_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_provider_point_transactions_provider ON provider_point_transactions(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_milestones_provider ON provider_milestones(provider_id, achieved_at DESC);
CREATE INDEX IF NOT EXISTS idx_providers_badge ON providers(current_badge_id) WHERE current_badge_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_provider_badges_tier ON provider_badges(tier, display_order) WHERE is_active = true;

-- Triggers
DROP TRIGGER IF EXISTS update_provider_badges_updated_at ON provider_badges;
CREATE TRIGGER update_provider_badges_updated_at BEFORE UPDATE ON provider_badges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_provider_points_updated_at ON provider_points;
CREATE TRIGGER update_provider_points_updated_at BEFORE UPDATE ON provider_points
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE provider_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_milestones ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Public can view active badges" ON provider_badges;
DROP POLICY IF EXISTS "Providers can view own points" ON provider_points;
DROP POLICY IF EXISTS "Public can view provider points" ON provider_points;
DROP POLICY IF EXISTS "Providers can view own transactions" ON provider_point_transactions;
DROP POLICY IF EXISTS "Providers can view own milestones" ON provider_milestones;
DROP POLICY IF EXISTS "Superadmins can manage badges" ON provider_badges;
DROP POLICY IF EXISTS "Superadmins can manage points" ON provider_points;
DROP POLICY IF EXISTS "Superadmins can manage transactions" ON provider_point_transactions;
DROP POLICY IF EXISTS "Superadmins can manage milestones" ON provider_milestones;

-- Public can view active badges
CREATE POLICY "Public can view active badges"
  ON provider_badges FOR SELECT
  USING (is_active = true);

-- Providers can view own points
CREATE POLICY "Providers can view own points"
  ON provider_points FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM providers p
      WHERE p.id = provider_points.provider_id
      AND (p.user_id = auth.uid() OR
           EXISTS (SELECT 1 FROM provider_staff ps WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()))
    )
  );

-- Public can view provider points (for display on cards)
CREATE POLICY "Public can view provider points"
  ON provider_points FOR SELECT
  USING (true);

-- Providers can view own transactions
CREATE POLICY "Providers can view own transactions"
  ON provider_point_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM providers p
      WHERE p.id = provider_point_transactions.provider_id
      AND (p.user_id = auth.uid() OR
           EXISTS (SELECT 1 FROM provider_staff ps WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()))
    )
  );

-- Providers can view own milestones
CREATE POLICY "Providers can view own milestones"
  ON provider_milestones FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM providers p
      WHERE p.id = provider_milestones.provider_id
      AND (p.user_id = auth.uid() OR
           EXISTS (SELECT 1 FROM provider_staff ps WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()))
    )
  );

-- Superadmins can manage all
CREATE POLICY "Superadmins can manage badges"
  ON provider_badges FOR ALL
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'superadmin'));

CREATE POLICY "Superadmins can manage points"
  ON provider_points FOR ALL
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'superadmin'));

CREATE POLICY "Superadmins can manage transactions"
  ON provider_point_transactions FOR ALL
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'superadmin'));

CREATE POLICY "Superadmins can manage milestones"
  ON provider_milestones FOR ALL
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'superadmin'));

-- Function to calculate and update provider points
CREATE OR REPLACE FUNCTION calculate_provider_points(p_provider_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_points INTEGER := 0;
  v_bookings INTEGER;
  v_reviews INTEGER;
  v_rating NUMERIC;
  v_earnings NUMERIC;
BEGIN
  -- Get provider stats
  SELECT 
    COALESCE(total_bookings, 0),
    COALESCE(review_count, 0),
    COALESCE(rating_average, 0),
    COALESCE(total_earnings, 0)
  INTO v_bookings, v_reviews, v_rating, v_earnings
  FROM providers
  WHERE id = p_provider_id;

  -- Points calculation (customize as needed)
  -- Booking points: 10 points per completed booking
  v_points := v_points + (v_bookings * 10);
  
  -- Review points: 5 points per review
  v_points := v_points + (v_reviews * 5);
  
  -- Rating bonus: 50 points per 0.5 star above 4.0
  IF v_rating >= 4.0 THEN
    v_points := v_points + (FLOOR((v_rating - 4.0) / 0.5)::INTEGER * 50);
  END IF;
  
  -- Earnings bonus: 1 point per 100 currency units
  v_points := v_points + (FLOOR(v_earnings / 100)::INTEGER);

  RETURN v_points;
END;
$$ LANGUAGE plpgsql;

-- Function to check and award badges
CREATE OR REPLACE FUNCTION check_provider_badges(p_provider_id UUID)
RETURNS UUID AS $$
DECLARE
  v_current_badge_id UUID;
  v_points INTEGER;
  v_rating NUMERIC;
  v_reviews INTEGER;
  v_bookings INTEGER;
  v_eligible_badge_id UUID;
  v_badge_record RECORD;
BEGIN
  -- Get current stats - handle case where provider_points doesn't exist yet
  SELECT 
    COALESCE(pp.current_badge_id, NULL),
    COALESCE(pp.total_points, 0),
    COALESCE(p.rating_average, 0),
    COALESCE(p.review_count, 0),
    COALESCE(p.total_bookings, 0)
  INTO v_current_badge_id, v_points, v_rating, v_reviews, v_bookings
  FROM providers p
  LEFT JOIN provider_points pp ON pp.provider_id = p.id
  WHERE p.id = p_provider_id;
  
  -- If provider_points doesn't exist, calculate points and create record
  IF NOT EXISTS (SELECT 1 FROM provider_points WHERE provider_id = p_provider_id) THEN
    v_points := calculate_provider_points(p_provider_id);
    INSERT INTO provider_points (provider_id, total_points, lifetime_points, last_calculated_at)
    VALUES (p_provider_id, v_points, v_points, NOW())
    ON CONFLICT (provider_id) DO NOTHING;
  END IF;

  -- Find highest eligible badge
  SELECT id INTO v_eligible_badge_id
  FROM provider_badges
  WHERE is_active = true
    AND (requirements->>'points')::INTEGER <= v_points
    AND (requirements->>'min_rating')::NUMERIC <= COALESCE(v_rating, 0)
    AND (requirements->>'min_reviews')::INTEGER <= COALESCE(v_reviews, 0)
    AND (requirements->>'min_bookings')::INTEGER <= COALESCE(v_bookings, 0)
  ORDER BY tier DESC, (requirements->>'points')::INTEGER DESC
  LIMIT 1;

  -- Update if badge changed
  IF v_eligible_badge_id IS DISTINCT FROM v_current_badge_id THEN
    -- Ensure provider_points record exists before updating
    INSERT INTO provider_points (provider_id, total_points, lifetime_points, current_badge_id, badge_earned_at, badge_expires_at)
    VALUES (
      p_provider_id,
      v_points,
      v_points,
      v_eligible_badge_id,
      CASE WHEN v_eligible_badge_id IS NOT NULL THEN NOW() ELSE NULL END,
      CASE WHEN v_eligible_badge_id IS NOT NULL THEN NOW() + INTERVAL '30 days' ELSE NULL END
    )
    ON CONFLICT (provider_id)
    DO UPDATE SET
      current_badge_id = v_eligible_badge_id,
      badge_earned_at = CASE WHEN v_eligible_badge_id IS NOT NULL THEN NOW() ELSE NULL END,
      badge_expires_at = CASE 
        WHEN v_eligible_badge_id IS NOT NULL 
        THEN NOW() + INTERVAL '30 days' -- Badge expires if not maintained
        ELSE NULL 
      END;

    UPDATE providers
    SET current_badge_id = v_eligible_badge_id
    WHERE id = p_provider_id;
  END IF;

  RETURN v_eligible_badge_id;
END;
$$ LANGUAGE plpgsql;

-- Function to recalculate points and check badges
CREATE OR REPLACE FUNCTION recalculate_provider_gamification(p_provider_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_new_points INTEGER;
  v_badge_id UUID;
  v_result JSONB;
BEGIN
  -- Calculate new points
  v_new_points := calculate_provider_points(p_provider_id);
  
  -- Update or insert provider points
  INSERT INTO provider_points (provider_id, total_points, lifetime_points, last_calculated_at)
  VALUES (p_provider_id, v_new_points, v_new_points, NOW())
  ON CONFLICT (provider_id) 
  DO UPDATE SET
    total_points = v_new_points,
    lifetime_points = GREATEST(provider_points.lifetime_points, v_new_points),
    last_calculated_at = NOW();

  -- Check and update badge
  v_badge_id := check_provider_badges(p_provider_id);

  -- Build result
  v_result := jsonb_build_object(
    'points', v_new_points,
    'badge_id', v_badge_id
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Function to award points for a specific event
CREATE OR REPLACE FUNCTION award_provider_points(
  p_provider_id UUID,
  p_points INTEGER,
  p_source TEXT,
  p_source_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_new_total INTEGER;
  v_calculated_points INTEGER;
  v_current_lifetime INTEGER;
BEGIN
  -- Insert transaction
  INSERT INTO provider_point_transactions (provider_id, points, source, source_id, description)
  VALUES (p_provider_id, p_points, p_source, p_source_id, p_description);

  -- Calculate total points from provider stats (more accurate than just adding)
  v_calculated_points := calculate_provider_points(p_provider_id);

  -- Get current lifetime points if exists
  SELECT COALESCE(lifetime_points, 0) INTO v_current_lifetime
  FROM provider_points
  WHERE provider_id = p_provider_id;

  -- Update or insert provider points
  INSERT INTO provider_points (provider_id, total_points, lifetime_points)
  VALUES (p_provider_id, v_calculated_points, GREATEST(v_calculated_points, v_current_lifetime))
  ON CONFLICT (provider_id) 
  DO UPDATE SET
    total_points = v_calculated_points,
    lifetime_points = GREATEST(provider_points.lifetime_points, v_calculated_points),
    last_calculated_at = NOW();

  -- Check and update badge
  PERFORM check_provider_badges(p_provider_id);

  RETURN v_calculated_points;
END;
$$ LANGUAGE plpgsql;

-- Function to get provider subscription status (considering badges)
CREATE OR REPLACE FUNCTION get_provider_subscription_status(p_provider_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_badge_id UUID;
  v_badge_benefits JSONB;
  v_subscription_status TEXT;
BEGIN
  -- Check if provider has a badge with free subscription
  SELECT pb.id, pb.benefits
  INTO v_badge_id, v_badge_benefits
  FROM provider_badges pb
  JOIN provider_points pp ON pp.current_badge_id = pb.id
  WHERE pp.provider_id = p_provider_id
    AND (pb.benefits->>'free_subscription')::BOOLEAN = true
    AND (pp.badge_expires_at IS NULL OR pp.badge_expires_at > NOW());

  IF v_badge_id IS NOT NULL THEN
    RETURN 'active'; -- Free subscription via badge
  END IF;

  -- Otherwise check regular subscription
  SELECT status INTO v_subscription_status
  FROM provider_subscriptions
  WHERE provider_id = p_provider_id
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW());

  RETURN COALESCE(v_subscription_status, 'inactive');
END;
$$ LANGUAGE plpgsql;

-- Insert default badges
INSERT INTO provider_badges (name, slug, description, tier, color, requirements, benefits, display_order) VALUES
('Rising Star', 'rising-star', 'New provider showing promise', 1, '#FFD700', 
 '{"points": 100, "min_rating": 4.0, "min_reviews": 5, "min_bookings": 10}'::jsonb,
 '{"free_subscription": false, "featured": false}'::jsonb, 1),

('Bronze Provider', 'bronze', 'Established provider with good performance', 2, '#CD7F32',
 '{"points": 500, "min_rating": 4.2, "min_reviews": 25, "min_bookings": 50}'::jsonb,
 '{"free_subscription": false, "featured": false}'::jsonb, 2),

('Silver Provider', 'silver', 'High-performing provider', 3, '#C0C0C0',
 '{"points": 1500, "min_rating": 4.5, "min_reviews": 100, "min_bookings": 200}'::jsonb,
 '{"free_subscription": true, "featured": true}'::jsonb, 3),

('Gold Provider', 'gold', 'Top-tier provider with excellent service', 4, '#FFD700',
 '{"points": 5000, "min_rating": 4.7, "min_reviews": 300, "min_bookings": 500}'::jsonb,
 '{"free_subscription": true, "featured": true}'::jsonb, 4),

('Platinum Provider', 'platinum', 'Elite provider in top 5%', 5, '#E5E4E2',
 '{"points": 15000, "min_rating": 4.8, "min_reviews": 1000, "min_bookings": 2000}'::jsonb,
 '{"free_subscription": true, "featured": true}'::jsonb, 5)
ON CONFLICT (slug) DO NOTHING;

-- Trigger to automatically recalculate points when provider stats change
CREATE OR REPLACE FUNCTION trigger_recalculate_provider_gamification()
RETURNS TRIGGER AS $$
BEGIN
  -- Only recalculate if relevant fields changed
  IF (TG_OP = 'UPDATE') THEN
    IF (
      OLD.total_bookings IS DISTINCT FROM NEW.total_bookings OR
      OLD.review_count IS DISTINCT FROM NEW.review_count OR
      OLD.rating_average IS DISTINCT FROM NEW.rating_average OR
      OLD.total_earnings IS DISTINCT FROM NEW.total_earnings
    ) THEN
      -- Recalculate directly (synchronous)
      -- This ensures points are always up-to-date, but may slightly slow down updates
      -- For high-volume scenarios, consider using pg_notify with a background worker
      BEGIN
        PERFORM recalculate_provider_gamification(NEW.id);
      EXCEPTION WHEN OTHERS THEN
        -- Log error but don't fail the provider update
        RAISE WARNING 'Error recalculating gamification for provider %: %', NEW.id, SQLERRM;
      END;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on providers table
DROP TRIGGER IF EXISTS providers_recalculate_gamification_trigger ON providers;
CREATE TRIGGER providers_recalculate_gamification_trigger
  AFTER UPDATE ON providers
  FOR EACH ROW
  WHEN (
    OLD.total_bookings IS DISTINCT FROM NEW.total_bookings OR
    OLD.review_count IS DISTINCT FROM NEW.review_count OR
    OLD.rating_average IS DISTINCT FROM NEW.rating_average OR
    OLD.total_earnings IS DISTINCT FROM NEW.total_earnings
  )
  EXECUTE FUNCTION trigger_recalculate_provider_gamification();

-- Function to initialize provider points for existing providers
CREATE OR REPLACE FUNCTION initialize_provider_points_for_all()
RETURNS INTEGER AS $$
DECLARE
  v_provider RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_provider IN SELECT id FROM providers WHERE status = 'active' LOOP
    BEGIN
      -- Initialize points if not exists
      INSERT INTO provider_points (provider_id, total_points, lifetime_points)
      SELECT 
        v_provider.id,
        calculate_provider_points(v_provider.id),
        calculate_provider_points(v_provider.id)
      ON CONFLICT (provider_id) DO NOTHING;
      
      -- Check and award badge
      PERFORM check_provider_badges(v_provider.id);
      
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Log error but continue
      RAISE WARNING 'Error initializing points for provider %: %', v_provider.id, SQLERRM;
    END;
  END LOOP;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
