-- ============================================================================
-- Migration 228: Provider point rules (superadmin-configurable points per task)
-- ============================================================================
-- Allows superadmin to control how many points are given for each task type.
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_point_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source TEXT NOT NULL UNIQUE,
  points INTEGER NOT NULL CHECK (points >= 0),
  label TEXT NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_point_rules_source ON provider_point_rules(source);

COMMENT ON TABLE provider_point_rules IS 'Configurable points per task. Superadmin can edit. Used by award_provider_points and award_provider_points_for_explore_post.';

-- RLS: only superadmin can read/write
ALTER TABLE provider_point_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmins can manage point rules" ON provider_point_rules;
CREATE POLICY "Superadmins can manage point rules"
  ON provider_point_rules FOR ALL
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'superadmin'));

-- Service role / backend needs to read when awarding (API uses supabaseAdmin which bypasses RLS)
-- For DB functions we use a SECURITY DEFINER helper that reads without RLS.
-- So we need a function that returns points for a source (used by award_provider_points_for_explore_post).
CREATE OR REPLACE FUNCTION get_provider_point_rule_points(p_source TEXT)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT points FROM provider_point_rules WHERE source = p_source LIMIT 1), 0);
$$;

-- Seed default rules (idempotent)
INSERT INTO provider_point_rules (source, points, label, description, display_order) VALUES
  ('booking_completed', 10, 'Completed booking', 'Points per completed booking', 1),
  ('review_received', 5, 'Customer review (base)', 'Base points per review received', 2),
  ('review_received_4star_bonus', 5, '4-star review bonus', 'Bonus points for 4-star review', 3),
  ('review_received_5star_bonus', 10, '5-star review bonus', 'Bonus points for 5-star review', 4),
  ('explore_post_after_booking', 15, 'Explore post after booking', 'Points for posting to Explore when provider had a completed booking in last 7 days', 5)
ON CONFLICT (source) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();

-- Trigger updated_at
DROP TRIGGER IF EXISTS provider_point_rules_updated_at ON provider_point_rules;
CREATE TRIGGER provider_point_rules_updated_at
  BEFORE UPDATE ON provider_point_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update explore-post award function to use configurable points (fallback 15)
CREATE OR REPLACE FUNCTION award_provider_points_for_explore_post(
  p_provider_id UUID,
  p_post_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points INTEGER;
  v_has_recent_booking BOOLEAN;
  v_already_awarded BOOLEAN;
BEGIN
  v_points := get_provider_point_rule_points('explore_post_after_booking');
  IF v_points <= 0 THEN
    v_points := 15;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM provider_point_transactions
    WHERE provider_id = p_provider_id
      AND source = 'explore_post_after_booking'
      AND source_id = p_post_id
  ) INTO v_already_awarded;
  IF v_already_awarded THEN
    RETURN 0;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM bookings
    WHERE provider_id = p_provider_id
      AND status = 'completed'
      AND completed_at IS NOT NULL
      AND completed_at >= (NOW() - INTERVAL '7 days')
    LIMIT 1
  ) INTO v_has_recent_booking;

  IF NOT v_has_recent_booking THEN
    RETURN 0;
  END IF;

  INSERT INTO provider_point_transactions (provider_id, points, source, source_id, description)
  VALUES (
    p_provider_id,
    v_points,
    'explore_post_after_booking',
    p_post_id,
    'Reward points for posting to Explore after a booking'
  );

  INSERT INTO provider_points (provider_id, total_points, lifetime_points, last_calculated_at)
  VALUES (p_provider_id, v_points, v_points, NOW())
  ON CONFLICT (provider_id)
  DO UPDATE SET
    total_points = provider_points.total_points + v_points,
    lifetime_points = provider_points.lifetime_points + v_points,
    last_calculated_at = NOW();

  PERFORM check_provider_badges(p_provider_id);

  RETURN v_points;
END;
$$;

-- Make calculate_provider_points use configurable rules (fallbacks: 10 booking, 5 review)
CREATE OR REPLACE FUNCTION calculate_provider_points(p_provider_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_points INTEGER := 0;
  v_bookings INTEGER;
  v_reviews INTEGER;
  v_rating NUMERIC;
  v_earnings NUMERIC;
  v_booking_pts INTEGER;
  v_review_pts INTEGER;
BEGIN
  v_booking_pts := get_provider_point_rule_points('booking_completed');
  IF v_booking_pts <= 0 THEN v_booking_pts := 10; END IF;
  v_review_pts := get_provider_point_rule_points('review_received');
  IF v_review_pts <= 0 THEN v_review_pts := 5; END IF;

  SELECT 
    COALESCE(total_bookings, 0),
    COALESCE(review_count, 0),
    COALESCE(rating_average, 0),
    COALESCE(total_earnings, 0)
  INTO v_bookings, v_reviews, v_rating, v_earnings
  FROM providers
  WHERE id = p_provider_id;

  v_points := v_points + (v_bookings * v_booking_pts);
  v_points := v_points + (v_reviews * v_review_pts);
  IF v_rating >= 4.0 THEN
    v_points := v_points + (FLOOR((v_rating - 4.0) / 0.5)::INTEGER * 50);
  END IF;
  v_points := v_points + (FLOOR(v_earnings / 100)::INTEGER);

  RETURN v_points;
END;
$$ LANGUAGE plpgsql;
